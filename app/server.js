// example bot
import botkit from 'botkit';
const Yelp = require('yelp');
const GoogleMapsAPI = require('googlemaps');

const yelp = new Yelp({
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

/*
Help section
*/
controller.hears('^help$', ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.reply(message, 'Say hello or hi to me, and I\'ll offer to make you a profile attachment with emojis and your favorite color!\n' +
  'Also, just let me know when you\'re hungry and you want to look for food and restaurants. I\'ll find the top 3 pics based on distance or rating, your choice :)\n' +
  'But I\'m very impatient, so if you stay idle too long after messaging me, I\'ll get angry and hurry you up. \n' +
  'Also, I can show you maps of where the restaurant is located using google maps!');
});

/*
Google Maps functionality
After the restaurant query, slackbot asks if the user wants to see a map
of the first result. If yes, then a request is made to Google Maps static
images API and a link to the map is returned
*/
// google maps
// cite: src template taken from https://www.npmjs.com/package/googlemaps and googlemaps api documentation
const publicConfig = {
  key: 'AIzaSyBYl7M-tyZ7o51lwSvcsnGXh9Z3O5AlvgM',
  stagger_time: 1000, // for elevationPath
  encode_polylines: false,
  secure: true, // use https
  proxy: 'http://127.0.0.1:9999', // optional, set a proxy for HTTP requests
};
const gmAPI = new GoogleMapsAPI(publicConfig);
const getMap = (bot, convo, address, latlong) => {
  const params = {
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
  gmAPI.staticMap(params, (err, binaryImage) => {
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

/*
Yelp functionality, performs a conversation with the user when the user he or she
is hungry.

First asks for what region the user is interested in, then what type of food,
and then how he/she would like to sort the 3 results returned by the request
to Yelps API
*/
// perform actual search query for the restaurant requesting data from Yelp's API
const search = (convo, region, term, sortPref, bot) => {
  yelp.search({ term, location: region, limit: 3, sort: 1 })
    .then((data) => {
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
      // ask if the user would like to see a map of the first result , if so
      // save the address and longitude and latutude returned by the request made to YELP
      convo.ask('Do you want a map to the first result?', [
        {
          pattern: bot.utterances.yes,
          callback(response) {
            const first = data.businesses[1];
            const address = `${first.location.address} ${first.location.city} ${first.location.state_code}`;
            console.log(address);
            const latlong = `${first.location.coordinate.latitude} ${first.location.coordinate.latitude}`;
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
    .catch((err) => {
      console.error(err);
    });
};

// ask the user how he/she wants to search, by distance, rating, or best matched (default)
const askSearch = (response, convo, region, term, bot) => {
  convo.ask('Sort by distance?', [
    {
      pattern: bot.utterances.yes,
      callback() {
        search(convo, region, term, 1, bot);
        convo.next();
      },
    },
    {
      default: true,
      callback() {
        convo.ask('Sort by rating?', [
          {
            pattern: bot.utterances.yes,
            callback() {
              search(convo, region, term, 2, bot);
            },
          },
          {
            default: true,
            callback() {
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

// ask the type of food the user is searching for
const askType = (response, convo, region, bot) => {
  convo.ask('What type of cuisine? If no preference just say none', [
    {
      pattern: 'none',
      callback() {
        askSearch(response, convo, region, 'restaurants', bot);
        convo.next();
      },
    },
    {
      default: true,
      callback() {
        askSearch(response, convo, region, response.text, bot);
        convo.next();
      },
    },
  ]);
};

// ask the region for the restaurant query
const askRegion = (response, convo, bot) => {
  convo.ask('Let me search for you \n For what city do you want food recomendations?', [
    {
      pattern: 'Here',
      callback() {
        askType(response, convo, 'Hanover, NH', bot);
        convo.next();
      },
    },
    {
      default: true,
      callback() {
        askType(response, convo, response.text, bot);
        convo.next();
      },
    },
  ]);
};

// have the bot listen to when user is hungry or mutters any similar words
controller.hears(['hungry', 'food', 'restaurant'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.startConversation(message, (response, convo) => {
    askRegion(response, convo, bot);
  });
});


/*
Basic conversation

Whenever user says hello, bot asks if he/she would like to create a profile,
if so, then a conversation initiates with the bot asking and processing basic
information about the user to render and return at the
end of the conversation a small profile given in an attachment.

If user says they do not want to make a profile, bot lets user know that whenever
the user does, he/she just has to say now.
*/

// renders the users profile, displaying the age and using favorite color as
// bar on the side of attachment(if user failed to specify an acceptable color
// bar appears gray), and mood as an emoji
let username;
const makeProfile = (bot, convo, age, favoriteColor, mood) => {
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
// asks for the mood of the user
const askMood = (bot, convo, age, color) => {
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

// ask for users favorite color in the rainbow,
const askColor = (bot, convo, age) => {
  const rainbow = { // colors of the rainbow object that maps names to color codes
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

// ask Age of the user
const askAge = (bot, convo) => {
  convo.ask('How old are you?', (response) => {
    askColor(bot, convo, 'Age:'.concat(response.text));
    convo.next();
  });
};


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
        callback() {
          convo.say('Ok, whenever you do just say: \'now\'');
          convo.next();
        },
      },
      {
        pattern: bot.utterances.yes,
        callback() {
          askAge(bot, convo);
          convo.next();
        },
      },
      {
        default: true,
        callback() {
          convo.say('I didn\'t understand your response');
          convo.repeat();
          convo.next();
        },
      },
    ]);
  });
});

// when user says now make profile
controller.hears('^now$', 'direct_message', (bot, message) => {
  bot.startConversation(message, (response, convo) => {
    askAge(bot, convo);
    convo.next();
  });
});


/*
Timer functionality

If user initates a conversation by sending a direct message yet does not reply
after 20 seconds a message by the bot prompts the user

This also exits the conversation that the user was previously having with the user
If a restaurant query conversation was taking place, and the user takes longer
than 20 seconds to reply, the restaurant query conversation is exited
*/
let timer;
controller.on('direct_message', (bot, message) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    bot.reply(message, 'You haven\'t said anything in a while. I don\'t have too much time to waste.\n Type @lcbot help for help');
  }, 20000);
});

// wake up
controller.on('outgoing_webhook', (bot, message) => {
  console.log('here');
  bot.replyPublic(message, 'ya I\'m , awake');
});
