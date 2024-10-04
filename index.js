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

const mongoURL = 'mongodb+srv://Sharainwy:Mindbnk48@shar.xu2urv6.mongodb.net/'; 

async function getProfile(userId) {
  try {
    return await client.getProfile(userId);
  } catch (error) {
    console.error('Error getting profile:', error);
    return null;
  }
}

// Webhook callback
app.post('/webhook', line.middleware(config), async (req, res) => {
  if (!Array.isArray(req.body.events)) {
    return res.status(500).end();
  }

  try {
    await Promise.all(req.body.events.map(event => handleEvent(event)));
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

app.get('/', (req, res) => {
  res.status(200).send('OK Connect');
});

// Simple reply function
const replyText = (token, texts) => {
  texts = Array.isArray(texts) ? texts : [texts];
  return client.replyMessage(
    token,
    texts.map(text => ({ type: 'text', text }))
  );
};

// Handle events
async function handleEvent(event) {
  const clientdb = new MongoClient(mongoURL, { useNewUrlParser: true, useUnifiedTopology: true });
  await clientdb.connect();

  try {
    const database = clientdb.db('mydb');
    const userProfileCollection = database.collection('liff-user');
    const userProfile = await userProfileCollection.findOne({ userId: event.source.userId });

    if (userProfile) {
      // Send user profile data to WebSocket clients
      const dataToSend = {
        type: 'beacon',
        userId: userProfile.userId,
        displayName: userProfile.firstname,
        Linename: userProfile.displayName,
        pictureUrl: userProfile.picture,
        statusMessage: userProfile.position,
        occupplace: userProfile.location,
      };
    }

    switch (event.type) {
      case 'message':
        await handleMessage(event, database);
        break;
      case 'follow':
        await replyText(event.replyToken, 'Got followed event');
        break;
      case 'unfollow':
        console.log(`Unfollowed this bot: ${JSON.stringify(event)}`);
        break;
      case 'join':
        await replyText(event.replyToken, `Joined ${event.source.type}`);
        break;
      case 'leave':
        console.log(`Left: ${JSON.stringify(event)}`);
        break;
      case 'postback':
        await replyText(event.replyToken, `Got postback: ${event.postback.data}`);
        break;
      case 'beacon':
        await handleBeacon(event, database);
        break;
      default:
        throw new Error(`Unknown event: ${JSON.stringify(event)}`);
    }
  } catch (error) {
    console.error('Error handling event:', error);
  } finally {
    await clientdb.close();
  }
}

// Handle message events
async function handleMessage(event, database) {
  const message = event.message;
  const UserID = event.source.userId;

  switch (message.type) {
    case 'text':
      await handleText(message, event.replyToken);
      break;
    case 'image':
      await handleImage(message, event.replyToken);
      break;
    case 'video':
      await handleVideo(message, event.replyToken);
      break;
    case 'audio':
      await handleAudio(message, event.replyToken);
      break;
    case 'location':
      await handleLocation(message, event.replyToken);
      break;
    case 'sticker':
      await handleSticker(message, event.replyToken);
      break;
    default:
      throw new Error(`Unknown message type: ${JSON.stringify(message)}`);
  }
}

// Handle beacon events
async function handleBeacon(event, database) {
  const beaconUserId = event.source.userId;
  const checkinCollection = database.collection('checkins');
  const existingCheckin = await checkinCollection.findOne({ userId: beaconUserId });
  const userProfileCollection = database.collection('liff-user');
  const userProfile = await userProfileCollection.findOne({ userId: beaconUserId });

  const name = userProfile.displayName + " : " + userProfile.firstname;
  const bangkokTime = new Date(new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }));
  const currentCheckinDate = bangkokTime.toLocaleDateString('th-TH');
  const currentHour = bangkokTime.getHours();

  // ฟิลด์สำหรับตรวจสอบการเช็คอินในแต่ละช่วง
  let period = "";  // สำหรับเก็บข้อมูลช่วงเวลา (เช้า/บ่าย)

  // กำหนดช่วงเวลาเช็คอิน
  const morningStartHour = 6;
  const morningEndHour = 9;
  const afternoonStartHour = 15;
  const afternoonEndHour = 19;

  if (existingCheckin) {
    const lastCheckinDate = existingCheckin.checkinTime.split(' ')[0];
    // เช็คอินเช้า
    if (lastCheckinDate === currentCheckinDate && currentHour >= morningStartHour && currentHour < morningEndHour) {
      if (existingCheckin.morningCheckin) {
        return await replyText(event.replyToken, `คุณได้เช็คอินช่วงเช้าแล้วเวลา ${existingCheckin.morningCheckinTime}`);
      } else {
        await checkinCollection.updateOne(
          { userId: beaconUserId },
          {
            $set: {
              morningCheckin: true,
              morningCheckinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
            }
          }
        );
        period = "เช้า";
      }
    }
    // เช็คอินบ่าย
    else if (lastCheckinDate === currentCheckinDate && currentHour >= afternoonStartHour && currentHour < afternoonEndHour) {
      if (existingCheckin.afternoonCheckin) {
        return await replyText(event.replyToken, `คุณได้เช็คอินช่วงบ่ายแล้วเวลา ${existingCheckin.afternoonCheckinTime}`);
      } else {
        await checkinCollection.updateOne(
          { userId: beaconUserId },
          {
            $set: {
              afternoonCheckin: true,
              afternoonCheckinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
            }
          }
        );
        period = "บ่าย";
      }
    } else {
      return await replyText(event.replyToken, `ไม่สามารถเช็คอินได้ เนื่องจากไม่อยู่ในช่วงเวลาเช็คอินที่กำหนด`);
    }
  } else {
    // เช็คอินครั้งแรกของวัน
    if (currentHour >= morningStartHour && currentHour < morningEndHour) {
      await checkinCollection.insertOne({
        userId: beaconUserId,
        checkinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
        morningCheckin: true,
        morningCheckinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      });
      period = "เช้า";
    } else if (currentHour >= afternoonStartHour && currentHour < afternoonEndHour) {
      await checkinCollection.insertOne({
        userId: beaconUserId,
        checkinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
        afternoonCheckin: true,
        afternoonCheckinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      });
      period = "บ่าย";
    } else {
      console.log("Current Server Time: " + bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }));
      return await replyText(event.replyToken, `ไม่สามารถเช็คอินได้ในขณะนี้ เนื่องจากไม่อยู่ในช่วงเวลาเช็คอินที่กำหนด`);
    }
  }

  // ข้อมูลที่ส่งไปยัง WebSocket clients
  const dataToSend = {
    type: 'beacon',
    userId: userProfile.userId,
    displayName: userProfile.firstname,
    Linename: userProfile.displayName,
    pictureUrl: userProfile.picture,
    statusMessage: userProfile.position,
    occupplace: userProfile.location,
    checkinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
  };

  // ส่งข้อมูลไปยัง WebSocket clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(dataToSend));
    }
  });

  // ตอบกลับผู้ใช้งาน
  return await replyText(event.replyToken, `คุณได้เช็คอินช่วง${period} เรียบร้อยแล้ว เวลา ${bangkokTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
}

// Start WebSocket server
server.listen(3000, () => {
  console.log('WebSocket server started on port 3000');
});
