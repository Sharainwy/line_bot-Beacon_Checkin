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
      const dataToSend = {
        type: 'beacon',
        userId: userProfile.userId,
        displayName: userProfile.firstname,
        Linename: userProfile.displayName,
        pictureUrl: userProfile.picture,
        statusMessage: userProfile.position,
        occupplace: userProfile.location,
      };
      // Send data to all connected WebSocket clients
      // wss.clients.forEach(client => {
      //   if (client.readyState === WebSocket.OPEN) {
      //     client.send(JSON.stringify(dataToSend));
      //   }
      // });
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

  // Get current time in Bangkok
  const GMTTime = new Date(); 
  const bangkokTime = new Date(GMTTime.getTime() + (7 * 60 * 60 * 1000)); // Current time in Bangkok
  const currentCheckinDate = bangkokTime.toLocaleDateString('th-TH', { timeZone: 'Africa/Accra' });
  const currentHour = bangkokTime.getHours(); 

  // Define check-in periods
  const morningStartHour = 6;
  const morningEndHour = 10;
  const afternoonStartHour = 14;
  const afternoonEndHour = 23;

  let period = "";  // To hold the check-in period (morning/afternoon)

  if (existingCheckin) {
      // Check if the user has already checked in for today
      let currentDayCheckin = existingCheckin.history.find(item => item.date === currentCheckinDate);

      // If the user has a record for today, update their check-in status
      if (currentDayCheckin) {
          if (currentHour >= morningStartHour && currentHour < morningEndHour) {
              if (currentDayCheckin.morningCheckin) {
                  return await replyText(event.replyToken, `คุณได้เช็คอินช่วงเช้าแล้วเวลา ${currentDayCheckin.morningCheckinTime}`);
              } else {
                  currentDayCheckin.morningCheckin = true;
                  currentDayCheckin.morningCheckinTime = bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' });
                  currentDayCheckin.morningCheckinCount++;
                  period = "เช้า";
              }
          } else if (currentHour >= afternoonStartHour && currentHour < afternoonEndHour) {
              if (currentDayCheckin.afternoonCheckin) {
                  return await replyText(event.replyToken, `คุณได้เช็คอินช่วงบ่ายแล้วเวลา ${currentDayCheckin.afternoonCheckinTime}`);
              } else {
                  currentDayCheckin.afternoonCheckin = true;
                  currentDayCheckin.afternoonCheckinTime = bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' });
                  currentDayCheckin.afternoonCheckinCount++;
                  period = "บ่าย";
              }
          } else {
              return await replyText(event.replyToken, `ไม่สามารถเช็คอินได้ เนื่องจากไม่อยู่ในช่วงเวลาเช็คอินที่กำหนด`);
          }

          // Update the checkin collection with the new data for today
          await checkinCollection.updateOne(
              { userId: beaconUserId },
              { $set: { history: existingCheckin.history } }
          );
      } else {
          // If it's a new day, add a new check-in record for today
          let newCheckin = {
              date: currentCheckinDate,
              morningCheckin: false,
              morningCheckinTime: "",
              morningCheckinCount: 0,
              afternoonCheckin: false,
              afternoonCheckinTime: "",
              afternoonCheckinCount: 0
          };

          if (currentHour >= morningStartHour && currentHour < morningEndHour) {
              newCheckin.morningCheckin = true;
              newCheckin.morningCheckinTime = bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' });
              newCheckin.morningCheckinCount = 1;
              period = "เช้า";
          } else if (currentHour >= afternoonStartHour && currentHour < afternoonEndHour) {
              newCheckin.afternoonCheckin = true;
              newCheckin.afternoonCheckinTime = bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' });
              newCheckin.afternoonCheckinCount = 1;
              period = "บ่าย";
          } else {
              return await replyText(event.replyToken, `ไม่สามารถเช็คอินได้ในขณะนี้ เนื่องจากไม่อยู่ในช่วงเวลาเช็คอินที่กำหนด`);
          }

          // Add the new check-in record to the user's history
          existingCheckin.history.push(newCheckin);

          // Update the database with the new history
          await checkinCollection.updateOne(
              { userId: beaconUserId },
              { $set: { history: existingCheckin.history } }
          );
      }
  } else {
      // If the user is checking in for the first time, create a new record
      let newCheckin = {
          userId: beaconUserId,
          history: []
      };

      let checkinForToday = {
          date: currentCheckinDate,
          morningCheckin: false,
          morningCheckinTime: "",
          morningCheckinCount: 0,
          afternoonCheckin: false,
          afternoonCheckinTime: "",
          afternoonCheckinCount: 0
      };

      if (currentHour >= morningStartHour && currentHour < morningEndHour) {
          checkinForToday.morningCheckin = true;
          checkinForToday.morningCheckinTime = bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' });
          checkinForToday.morningCheckinCount = 1;
          period = "เช้า";
      } else if (currentHour >= afternoonStartHour && currentHour < afternoonEndHour) {
          checkinForToday.afternoonCheckin = true;
          checkinForToday.afternoonCheckinTime = bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' });
          checkinForToday.afternoonCheckinCount = 1;
          period = "บ่าย";
      } else {
          return await replyText(event.replyToken, `ไม่สามารถเช็คอินได้ในขณะนี้ เนื่องจากไม่อยู่ในช่วงเวลาเช็คอินที่กำหนด`);
      }

      // Add today's check-in to the new user's history
      newCheckin.history.push(checkinForToday);

      // Insert the new check-in document into the collection
      await checkinCollection.insertOne(newCheckin);
  }

  // Data to send to WebSocket clients
  const dataToSend = {
      type: 'beacon',
      userId: userProfile.userId,
      displayName: userProfile.firstname,
      Linename: userProfile.displayName,
      pictureUrl: userProfile.picture,
      statusMessage: userProfile.position,
      occupplace: userProfile.location,
      checkinTime: bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' })
  };

  // Send data to WebSocket clients
  wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(dataToSend));
      }
  });

  // Respond to user confirming successful check-in
  console.log(name+' เช็คอินสำเร็จสำหรับช่วง'+period+' : '+bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' }));
  return await replyText(event.replyToken, `เช็คอินสำเร็จสำหรับช่วง${period} เวลา: ${bangkokTime.toLocaleString('th-TH', { timeZone: 'Africa/Accra' })}`);
}


// Reply to different message types
async function handleText(message, replyToken) {
  return replyText(replyToken, message.text);
}

async function handleImage(message, replyToken) {
  return replyText(replyToken, 'Got Image');
}

async function handleVideo(message, replyToken) {
  return replyText(replyToken, 'Got Video');
}

async function handleAudio(message, replyToken) {
  return replyText(replyToken, 'Got Audio');
}

async function handleLocation(message, replyToken) {
  return replyText(replyToken, 'Got Location');
}

async function handleSticker(message, replyToken) {
  return replyText(replyToken, 'Got Sticker');
}

wss.on('connection', (ws) => {
  console.log('WebSocket connected');
});

wss.on('close', () => {
    console.log('WebSocket disconnected');
    // เพิ่มการจัดการเมื่อมีการตัดการเชื่อมต่อ WebSocket ที่นี่
  });

const port = config.port;

server.listen(port, () => {
  console.log(`Listening on ${port}`);
});
