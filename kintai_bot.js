 /*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           ______     ______     ______   __  __     __     ______
          /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
          \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
           \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
            \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/


This is a sample Slack bot built with Botkit.

This bot demonstrates many of the core features of Botkit:

* Connect to Slack using the real time API
* Receive messages based on "spoken" patterns
* Reply to messages
* Use the conversation system to ask questions
* Use the built in storage system to store and retrieve information
  for a user.

# RUN THE BOT:

  Get a Bot token from Slack:

    -> http://my.slack.com/services/new/bot

  Run your bot from the command line:

    node kintai_bot.js

# USE THE BOT:

  Find your bot inside Slack to send it a direct message.

  Say: "Hello"

  The bot will reply "Hello!"

  Say: "shutdown"

  The bot will ask if you are sure, and then shut itself down.

  Make sure to invite your bot into other channels using /invite @<my bot>!

# EXTEND THE BOT:

  Botkit has many features for building cool and useful bots!

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  Global Variables
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/
// ユーザ設定 (config.tomlから読み込む)
var config; 

// (話しかけてきた)ユーザのID。BotKitのStorageに保存したデータの参照に必要。
var id__;

/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 Main
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

var fs = require('fs');
var toml = require('toml');

// Read the config file
config = toml.parse(fs.readFileSync('config.toml', 'utf8'));

// Read the Slack's token from the config
if (!config.slack.token) {
    console.log('Error: Specify token in config.toml');
    process.exit(1);
}

var Botkit = require('botkit');
var os = require('os');

var controller = Botkit.slackbot({
    debug: true
});

var bot = controller.spawn({
    token: config.slack.token
}).startRTM();


/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 Message Handlers
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

// Shutdown message. This code is taken from the sample by Botkit.
controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {
    
    bot.startConversation(message, function(err, convo) {
	
        convo.ask('Are you sure you want me to shutdown?', [
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    }, 3000);
                }
            },
            {
		pattern: bot.utterances.no,
		default: true,
		callback: function(response, convo) {
                    convo.say('*Phew!*');
                    convo.next();
		}
            }
        ]);
    });
});

//controller.hears('help', ['direct_mention', 'mention'], help_handler);

controller.hears('.*', ['direct_mention', 'mention'], kintai_handler);

/**
 * 勤怠処理
 */
function kintai_handler(bot, message){
    // (話しかけてきた)ユーザのIDをグローバル変数に保持
    id__ = message.user;
    
    // Get the user's name who talk to bot using Slack.com API
    bot.api.users.info({user: message.user}, function(err, res) {
	var fname = res.user.profile.first_name;
	var lname = res.user.profile.last_name;
	var fullname = (fname && lname) ? (lname + ' ' + fname) : res.user.profile.name;
	var user = {};
	user.id = message.user;
	user.email = res.user.profile.email;
	user.fname = fname;
	user.lname = lname;
	user.fullname = fullname;
	user.orig_msg = message.text;
	
	// Collects the all information about kintai from the message sent by the user.
	var kintai = parseKintaiInfo(user.orig_msg);

	// Copy Kintai information	
	user.date = kintai.date;
	user.type = kintai.type;
	user.time = kintai.time;
	user.reason = kintai.reason;
	user.mail_subject = ['【勤怠連絡】', user.date, user.fullname].join(' ');

	// Storage(デフォルトだとメモリ)に保存
	saveUserInfo(user);
	
	bot.reply(fullname,  + "さん、了解〜");
	
	// メールを送るか、などを尋ねるため、「会話」を始める
	bot.startConversation(message, askForMail);
    });
}

/**
 * ヘルプ応答
 */
function help_handler(bot, message){
    var help = "日付 勤怠の種類 時刻(遅刻の時のみ) 理由の順で書いてね。例) 遅刻します。12:00出社。アラート対応のため<br>" +
	"順番を忘れちゃったら、普通に話しかけてくれればOK。それをそのままメールで送るよ。";
    bot.reply(help);
}

/**
 * ユーザ情報をSlackのメッセージオブジェクトに変換して返す
 * ref: https://api.slack.com/docs/formatting
 */
function formatMessageAttachment() {
    var user = getUserInfo();
    var fields = [];
    fields.push({
	"title":"件名",
	"value": user.mail_subject
    });
    fields.push({
	"title": "送信者",
	"value": user.fullname + ' (' + user.email + ')'
    });
    fields.push({
	"title":"勤怠種別",
	"value": user.type,
    });
    fields.push({
	"title":"理由",
	"value": user.reason
    });
    fields.push({
	"title":"元のメッセージ",
	"value": "_" + user.orig_msg  + "_"
    });
    
    var mail_confirmation = {
	"text": 'メールを送る? (40秒以内に、yes か no で答えてね)',
	"attachments": [{
	    "color":"#00FFFF", // color of the quotation line (cyan)
	    "pretext": "*メールの内容:*",
	    "mrkdwn_in": ["fields", "pretext"],
	    "fields": fields
	}]
    };
    
    return mail_confirmation;
}

/**
 * ユーザと対話する
 *
 * 1. メール送信のサマリを表示し、このメールを送るかユーザに尋ねる
 * 2. ユーザの応答が、yesならメール送信。 noなら何もしない。
 */
function askForMail(res, convo) {
    var user = getUserInfo();
    var attachment = formatMessageAttachment(user);
    console.log(attachment);
    
    convo.ask(attachment, [
	{
	    pattern: 'done',
	    callback: function(res, convo) {
		convo.say('完了。');
		convo.next();
	    }
	},
	{
	    pattern: bot.utterances.yes,
	    callback: function(res, convo){
		convo.say('了解。送るね');
		var user = getUserInfo();
		sendMail();		
		convo.next();
	    }
	},
	{
	    pattern: bot.utterances.no,
	    callback: function(res, convo) {
		convo.say('了解、送らないね。');
		convo.next();
	    }
	},
	{
	    default: true,
	    callback: function(res, convo) {
		// just repeat the question
		convo.say('ん?');
		convo.repeat();
		convo.next();
	    }
	}
    ]);

    setTimeout(function() {
	convo.say('タイムアウトになりました。');
	convo.next();
    }, 40000);
}


/**
 * (BotKitのストレージから)ユーザ情報を取得する
 */
function getUserInfo() {
    // TODO: id__ を グローバル変数に持たなくても良い方法を考える    
    var userid = id__;
    var info;
    controller.storage.users.get(userid, function(err, userinfo) {
	info = userinfo;
    });
    return info;
}

/**
 * (BotKitのストレージに)ユーザ情報を保存する
 */
function saveUserInfo(userinfo) {
    controller.storage.users.save(userinfo, function(err, id) {
	// What should be done here?
    });
}

/**
 * 勤怠メッセージから、サマリの表示用に情報を抜粋する
 */
function parseKintaiInfo(message) {
    // 日付の正規表現
    var date_re = /\d\d?\/\d\d?|[今本]日|明日|明後日/;
    // 時刻の正規表現
    var time_re = /\d\d?時\s*(?:半|\d\d?分)|\d\d?:\d\d?/;
    // 勤怠種別
    var type_re = /有[給休]|代休|遅[刻れ延]|早退|休み/;
    // 理由の正規表現
    var reason_re = /病気|風邪|電車遅延|腹痛|急用|体調不良|アラート|通院|私用|所用|(?:.*?看病)/;
    
    var na = 'N/A';
    var info = {};
    var matches;
    
    //  メッセージから日付を抽出
    matches = message.match(date_re);
    if (matches && matches.length > 0)
	info.date = matches[0];
    else
	info.date = getToday(); // 日付を省略したら今日が対象
    
    //  メッセージから時刻を抽出
    matches = message.match(time_re);
    info.time = (matches && matches.length > 0) ? matches[0] : na;

    //  メッセージから勤怠種別を抽出
    matches = message.match(type_re);
    info.type = (matches && matches.length > 0) ? matches[0] : na;
    if (info.type == '本日')
	info.date = getToday();
    if (info.type == '遅れ')
	info.type = '遅刻';
    
    // メッセージから理由を抽出
    matches = message.match(reason_re);
    info.reason = (matches && matches.length > 0) ? matches[0] + 'のため' : na;

    return info;
}

/**
 * 今日の日付を返す。
 * サーバがGMT設定なので、日本時間に決め打ちで変える
 */
function getToday() {
    var d = new Date(Date.now() + 9*60*60);
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    if (m < 10)
	m = '0' + m;

    return y + '' + m + '' + d.getDate();
}

// ---------------------------------------------------------------------
// Send e-mail using Mailgun service

function sendMail() {
    var mailgun = require('mailgun-js')({
	apiKey: config.mailgun.key,
	domain: config.mailgun.domain
    });
    var ejs = require('ejs');
    var user = getUserInfo();
    var mail_body = ejs.render(config.mail.body, {user: user});
    var data = {
	from: config.mail.from,
	//	to: config.mail.to,
	to: user.email,
	subject: user.mail_subject,
	text: mail_body || '(empty)'
    };
    mailgun.messages().send(data, function(err, body) {
	console.log(body);
	if (!err)
	    convo.say('送ったよ! 確認してね。');
	else
	    convo.say('送れなかった。すみませんが自分でメールしてね。');
    });
}
