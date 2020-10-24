'use strict';

const AWS = require('aws-sdk')
AWS.config.update({ region: "us-east-1" })

const S3 = new AWS.S3()
const rekognition = new AWS.Rekognition()
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })


const getImageLabels = async (file) => {
  const params = {
    Image: {
      Bytes: Buffer.from(file, 'base64'),
    },
    MaxLabels: 30,
    MinConfidence: 65,
  }
  console.log(`params: ${params}`)
  const labels = await rekognition.detectLabels(params).promise()
  console.log(`labels: ${labels}`)

  return labels.Labels
}

const sqsSendMessage = async (item) => {
  const params = {
    MessageBody: JSON.stringify(item),
    QueueUrl: `https://sqs.us-east-1.amazonaws.com/194753468199/img-ml-sqs`
  }
  await sqs.sendMessage(params, (err, data) => {
    if (err) {
      console.log("Error", err);
    } else {
      console.log("Successfully added message", data.MessageId);
    }
  }).promise();
}

module.exports.handler = async (event, context, callback) => {

  try {
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));

    const image = await S3.getObject({
      Bucket: process.env.bucket,
      Key: key
    }).promise()

    console.log(image)

    const labels = await getImageLabels(image.Body.toString('base64'))

    console.log(labels)

    const item = {
      key: process.env.bucket,
      data: labels.map(label => {
        return {
          name: label.Name,
          acc: label.Confidence
        }
      })
    }


    console.log(`item: ${JSON.stringify(item)}`)

    await sqsSendMessage(item)

    return item
  } catch (err) {
    const errorMessage = {
      statusCode: 400,
      body: { err }
    }

    await sqsSendMessage(errorMessage)

    return err;
  }
};
