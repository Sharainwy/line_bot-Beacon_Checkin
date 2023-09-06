'use strict';

const line = require('@line/bot-sdk');
const express = require('express');
const config = require('./config.json');
const http = require('http'); 
const WebSocket = require('ws');
const { MongoClient } = require('mongodb');

const client = new line.Client(config);
const app = express();
const server = http.createServer(app); 
const wss = new WebSocket.Server({ server });


async function getProfile(userId) {
  try {
    const profile = await client.getProfile(userId);
    return profile;
  } catch (error) {
    console.error('Error getting profile:', error);
    return null;
  }
}

const mongoURL = 'mongodb+srv://Sharainwy:Mindbnk48@shar.xu2urv6.mongodb.net/'; 

// webhook callback
app.post('/webhook', line.middleware(config), (req, res) => {
  // req.body.events should be an array of events
  if (!Array.isArray(req.body.events)) {
    return res.status(500).end();
  }
  // handle events separately
  Promise.all(req.body.events.map(event => {
    console.log('event', event);
    // check verify webhook event
    if (event.replyToken === '00000000000000000000000000000000' ||
      event.replyToken === 'ffffffffffffffffffffffffffffffff') {
      return;
    }
    return handleEvent(event);
  }))
    .then(() => res.end())
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});


app.get('/',  (req, res) => {
  try {
    
    res.status(200).send('OK Connect');
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred');
  }
});

// simple reply function
const replyText = (token, texts) => {
  texts = Array.isArray(texts) ? texts : [texts];
  return client.replyMessage(
    token,
    texts.map((text) => ({ type: 'text', text }))
  );
};

// callback function to handle a single event
async function handleEvent(event) {
  try {
    const clientdb = new MongoClient(mongoURL, { useNewUrlParser: true, useUnifiedTopology: true });

    await clientdb.connect();
    const database = clientdb.db();
    const userProfileCollection = database.collection('registration');
    const userProfile = await userProfileCollection.findOne({ userId: event.source.userId });
    if (userProfile) {
      const dataToSend = {
        type: 'message',
        userId: userProfile.userId,
        displayName: userProfile.name,
        pictureUrl: userProfile.pictureUrl,
        statusMessage: userProfile.occupation,     
        occupplace: userProfile.jobdescription,
      };
      wss.clients.forEach(async (client) => {
        client.send(JSON.stringify(dataToSend));
      });
    }

  switch (event.type) {
    case 'message':
      const message = event.message;
      const UserID = event.source.userId;
      const msgtype = event.type;
      const Rev = event.message.type;
      console.log('UserID : ' + UserID + '\nEvent : ' + msgtype + '  type : ' + Rev);
      if (message.type === 'text') {
        const text = message.text.trim();
        if (text === 'ลงทะเบียน') {
          return replyText(event.replyToken, 'กรุณาพิมพ์ชื่อและอาชีพของคุณ (แยกบรรทัด)');
        }
        if (text === 'ลบข้อมูล') {
          return deleteUserData(UserID, event.replyToken);
        }
        const registrationData = text.split('\n');
        if (registrationData.length === 3) {
          const [name, occupation,jobdescription] = registrationData;
          const clientdb = new MongoClient(mongoURL, { useNewUrlParser: true, useUnifiedTopology: true });
          try {
            await clientdb.connect();
            const database = clientdb.db();
            const registrationCollection = database.collection('registration');

            const existingRegistration = await registrationCollection.findOne({ userId: UserID });

            if (existingRegistration) {
              return replyText(event.replyToken, 'คุณได้ลงทะเบียนข้อมูลแล้ว');
            } else {
              const profile = await client.getProfile(UserID);
              const registrationDocument = {
                name,
                occupation,
                jobdescription,
                userId: UserID,
                displayName: profile.displayName,
                pictureUrl: profile.pictureUrl,
                statusMessage: profile.statusMessage,
              };
              
              await registrationCollection.insertOne(registrationDocument);
              
              return replyText(event.replyToken, 'ข้อมูลของคุณถูกบันทึกเรียบร้อยแล้ว');
            }
            
          } finally {
            await clientdb.close();
          }
        } 
      }

      switch (message.type) {
        case 'text':
          //return handleText(message, event.replyToken);
        case 'image':
          return handleImage(message, event.replyToken);
        case 'video':
          return handleVideo(message, event.replyToken);
        case 'audio':
          return handleAudio(message, event.replyToken);
        case 'location':
          return handleLocation(message, event.replyToken);
        case 'sticker':
          return handleSticker(message, event.replyToken);
        default:
          throw new Error(`Unknown message: ${JSON.stringify(message)}`);
      }

    case 'follow':
      return replyText(event.replyToken, 'Got followed event');

    case 'unfollow':
      return console.log(`Unfollowed this bot: ${JSON.stringify(event)}`);

    case 'join':
      return replyText(event.replyToken, `Joined ${event.source.type}`);

    case 'leave':
      return console.log(`Left: ${JSON.stringify(event)}`);

    case 'postback':
      let data = event.postback.data;
      return replyText(event.replyToken, `Got postback: ${data}`);

    case 'beacon':
      // const dm = `${Buffer.from(event.beacon.dm || '', 'hex').toString('utf8')}`;
      // return replyText(event.replyToken, `${event.beacon.type} beacon hwid : ${event.beacon.hwid} with device message = ${dm}`);
      const beacontype = event.type;
      const beaconUserId = event.source.userId;
      console.log('UserID : ' + beaconUserId + '\nEvent : ' + beacontype + '  type : ' + event.beacon.type);

      return replyText(event.replyToken, 'Hello\nBeacon Status : ' + beacontype);
    default:
      throw new Error(`Unknown event: ${JSON.stringify(event)}`);
  }
} catch (error) {
  console.error('Error handling event and saving to MongoDB:', error);
}
}

async function deleteUserData(userId, replyToken) {
  const clientdb = new MongoClient(mongoURL, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await clientdb.connect();
    const database = clientdb.db();
    const registrationCollection = database.collection('registration');

    const result = await registrationCollection.deleteOne({ userId: userId });

    if (result.deletedCount === 1) {
      return replyText(replyToken, 'ลบข้อมูลของคุณเรียบร้อยแล้ว');
    } else {
      return replyText(replyToken, 'ไม่พบข้อมูลของคุณในระบบ');
    }
  } finally {
    await clientdb.close();
  }
}

function handleText(message, replyToken) {
  //return replyText(replyToken, message.text);
}
function handleImage(message, replyToken) {
  return replyText(replyToken, 'Got Image');
}
function handleVideo(message, replyToken) {
  return replyText(replyToken, 'Got Video');
}
function handleAudio(message, replyToken) {
  return replyText(replyToken, 'Got Audio');
}
function handleLocation(message, replyToken) {
  return replyText(replyToken, 'Got Location');
}
function handleSticker(message, replyToken) {
  return replyText(replyToken, 'Got Sticker');
}

wss.on('connection', (ws) => {
  console.log('WebSocket connected');
});
  // รับข้อมูลจากหน้าเว็บผ่าน WebSocket และส่งไปยัง LINE Bot
  // ws.on('message', async (data) => {
  //   const message = JSON.parse(data);
  //   if (message.type === 'beacon') {
  //     // ขอข้อมูลผู้ใช้จาก LINE Messaging API
  //     const userProfile = await client.getProfile(message.userId);
      
  //     // สร้างข้อมูลที่จะส่งกลับไปยังหน้าเว็บ
  //     const dataToSend = {
  //       type: 'beacon',
  //       text: event.beacon.type,
  //       userId: userProfile.userId,
  //       displayName: userProfile.displayName,
  //       pictureUrl: userProfile.pictureUrl,
  //       statusMessage: userProfile.statusMessage
  //     };

  //     // ส่งข้อมูลไปยังหน้าเว็บผ่าน WebSocket
  //     ws.send(JSON.stringify(dataToSend));
  //   }
  // });
  wss.on('close', () => {
    console.log('WebSocket disconnected');
    // เพิ่มการจัดการเมื่อมีการตัดการเชื่อมต่อ WebSocket ที่นี่
  });


const port = config.port;

server.listen(port, () => {
  console.log(`listening on ${port}`);
});
