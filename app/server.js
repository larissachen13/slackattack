// example bot
import botkit from 'botkit';
var Yelp = require('yelp');
var GoogleMapsAPI = require('googlemaps');

var yelp = new Yelp({
  consumer_key: 'GFf1qOejeG0y1BhU4gP3Sg',
  consumer_secret: 'KvA1eXJgz2VCZrDSHvOgl_YGo38',
  token: 'NVn7JC8-H1W4fgdq3eMDfm9LhD0IwwNt',
  token_secret: '1R1o62049NzKxSMxjQGyxIf6FX8',
});

// botkit controller
const controller = botkit.slackbot({
  debug: false,
});

// initialize slackbot
const slackbot = controller.spawn({
  token: process.env.SLACK_BOT_TOKEN,
  // this grabs the slack token we exported earlier
}).startRTM(err => {
  // start the real time message client
  if (err) { throw new Error(err); }
});

// prepare webhook
// for now we won't use this but feel free to look up slack webhooks
controller.setupWebserver(process.env.PORT || 3001, (err, webserver) => {
  controller.createWebhookEndpoints(webserver, slackbot, () => {
    if (err) { throw new Error(err); }
  });
});

// help
controller.hears('^help$', ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.reply(message, 'Say hello or hi to me, and I\'ll offer to make you a profile attachment with emojis and your favorite color!\n' +
  'Also, just let me know when you\'re hungry and you want to look for food and restaurants. I\'ll find the top 3 pics based on distance or rating, your choice :)\n' +
  'But I\'m very impatient, so if you stay idle too long after messaging me, I\'ll get angry and hurry you up. ');
});


// yelp functionality
controller.hears(['hungry', 'food', 'restaurant'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.startConversation(message, (response, convo) => {
    askRegion(response, convo, bot);
  });
});

var askRegion = function (response, convo, bot) {
  convo.ask('Let me search for you \n For what city do you want food recomendations?', [
    {
      pattern: 'Here',
      callback(response) {
        askType(response, convo, 'Hanover, NH', bot);
        convo.next();
      },
    },
    {
      default: true,
      callback(response) {
        askType(response, convo, response.text, bot);
        convo.next();
      },
    },
  ]);
};

var askType = function (response, convo, region, bot) {
  convo.ask('What type of cuisine? If no preference just say none', [
    {
      pattern: 'none',
      callback(response) {
        askSearch(response, convo, region, 'restaurants', bot);
        convo.next();
      },
    },
    {
      default: true,
      callback(response) {
        askSearch(response, convo, region, response.text, bot);
        convo.next();
      },
    },
  ]);
};

var askSearch = function (response, convo, region, term, bot) {
  convo.ask('Sort by distance?', [
    {
      pattern: bot.utterances.yes,
      callback(response) {
        search(convo, region, term, 1, bot);
        convo.next();
      },
    },
    {
      default: true,
      callback(response) {
        convo.ask('Sort by rating?', [
          {
            pattern: bot.utterances.yes,
            callback(response) {
              search(convo, region, term, 2, bot);
            },
          },
          {
            default: true,
            callback(response) {
              convo.say('Alright sorting by best match');
              search(convo, region, term, 0);
              convo.next();
            },
          },
        ]);
        convo.next();
      },
    },
  ]);
};

var search = function (convo, region, term, sortPref, bot) {
  yelp.search({ term, location: region, limit: 3, sort: 1 })
    .then(function (data) {
      data.businesses.forEach(business => {
        convo.say({
          text: business.rating,
          attachments: [
            {
              title: business.name,
              title_link: business.url,
              text: business.snippet_text,
              image_url: business.image_url,
            },
          ],
        });
        console.log(business);
        convo.next();
      });
      convo.next();
      convo.ask('Do you want a map to the first result?', [
        {
          pattern: bot.utterances.yes,
          callback(response) {
            const first = data.businesses[1];
            const address = first.location.address + ' ' + first.location.city + ' ' + first.location.state_code;
            console.log(address);
            const latlong = first.location.coordinate.latitude + ',' + first.location.coordinate.latitude;
            console.log(latlong);
            getMap(bot, convo, address, latlong);
          },
        },
        {
          default: true,
          callback(response) {
            convo.say('Ok hope you got what you needed!');
            convo.next();
          },
        },
      ]);
    })
    .catch(function (err) {
      console.error(err);
    });
};

// google maps
// cite: src template taken from https://www.npmjs.com/package/googlemaps and googlemaps api documentation
var publicConfig = {
  key: 'AIzaSyBn1BNnPnVOzB56pNS5hO-AL1mtTDxFGqo',
  stagger_time: 1000, // for elevationPath
  encode_polylines: false,
  secure: true, // use https
  proxy: 'http://127.0.0.1:9999', // optional, set a proxy for HTTP requests
};
var gmAPI = new GoogleMapsAPI(publicConfig);
var getMap = function (bot, convo, address, latlong) {
  var params = {
    center: address,
    zoom: 15,
    size: '500x400',
    maptype: 'roadmap',
    markers: [
      {
        location: address,
        label: 'A',
        color: 'green',
        shadow: true,
      },
      {
        location: address,
        icon: 'http://chart.apis.google.com/chart?chst=d_map_pin_icon&chld=cafe%7C996600',
      },
    ],
    style: [
      {
        feature: 'road',
        element: 'all',
        rules: {
          hue: '0x00ff00',
        },
      },
    ],
  };
  const mapURL = gmAPI.staticMap(params); // return static map URL
  gmAPI.staticMap(params, function (err, binaryImage) {
    convo.say({
      text: 'Map',
      attachments: [
        {
          title: 'Click for Map',
          title_link: mapURL,
          image_url: binaryImage,
        },
      ],
    });
    convo.next();
  });
};

// conversation
let username;
controller.hears(['hello', 'hi', 'howdy'], 'direct_message', (bot, message) => {
  bot.api.users.info({ user: message.user }, (err, res) => {
    if (res) {
      username = res.user.name;
      bot.reply(message, `Hello, ${username}!`);
    } else {
      bot.reply(message, 'Hello there!');
    }
  });
  bot.startConversation(message, (response, convo) => {
    convo.ask('Do you want to make a profile?', [
      {
        pattern: bot.utterances.no,
        callback(response) {
          convo.say('Ok, whenever you do just say: \'now\'');
          convo.next();
        },
      },
      {
        pattern: bot.utterances.yes,
        callback(response) {
          askAge(bot, convo);
          convo.next();
        },
      },
      {
        default: true,
        callback(response) {
          convo.say('I didn\'t understand your response');
          convo.repeat();
          convo.next();
        },
      },
    ]);
  });
});

var askAge = function makeProfile(bot, convo) {
  convo.ask('How old are you?', (response) => {
    askColor(bot, convo, 'Age:'.concat(response.text));
    convo.next();
  });
};

var askColor = function (bot, convo, age) {
  const rainbow = {
    violet: '#9400D3',
    indigo: '#4B0082',
    blue: '#0000FF',
    green: '#00FF00',
    yellow: '#FFFF00',
    orange: '#FF7F00',
    red: '#FF0000',
  };
  convo.ask('Favorite color in the rainbow', (response) => {
    const color = rainbow[response.text.toLowerCase()];
    askMood(bot, convo, age, color);
    convo.next();
  });
};

var askMood = function (bot, convo, age, color) {
  convo.ask('Happy or sad?', (response) => {
    let emoji;
    if (response.text.toUpperCase() === 'HAPPY') {
      emoji = ':smile:';
    } else if (response.text.toUpperCase() === 'SAD') {
      emoji = ':disappointed:';
    } else {
      convo.say('Please choose either happy or sad');
      convo.repeat();
    }
    makeProfile(bot, convo, age, color, emoji);
    convo.next();
  });
};

var makeProfile = function (bot, convo, age, favoriteColor, mood) {
  convo.say({
    text: 'Your profile',
    icon_emoji: mood,
    attachments: [
      {
        author_name: username,
        text: age,
        color: favoriteColor,
        footer: 'By lcbot',
        ts: 123456789,
      },
    ],
  });
};

controller.hears('^now$', 'direct_message', (bot, message) => {
  bot.startConversation(message, (response, convo) => {
    askAge(bot, convo);
    convo.next();
  });
});


let timer;
controller.on('direct_message', (bot, message) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    bot.reply(message, 'You haven\'t said anything in a while. I don\'t have too much time to waste.\n Type @lcbot help for help');
  }, 9000);
});

// wake up
controller.on('outgoing_webhook', (bot, message) => {
  bot.replyPublic(message, 'ya I\'m , awake');
});

controller.on('message_received', (bot, message) => {
  // clearTimeout(myTimer);
  // myTimer = setTimeout(checkup, 10000);
});
