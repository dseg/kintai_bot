# About
勤怠連絡用チャットBOTです。
Slackのみ対応。

# 機能
BOTに話しかけると、勤怠の概要を表示しつつ、メールを送りたいか聞いてきます。
送りたかったら yes, やめる場合は noと話しかけて下さい。

![BOTに話しかける](http://dseg.github.io/img/kintai_bot/1o.png)
![(設定先に)メールが送信される](http://dseg.github.io/img/kintai_bot/2o.png)

# 使い方
```bash
git clone https://github.com/dseg/kintai_bot
cd kintai_bot
# 依存モジュールインストール
npm install
```

SlackでBOTを使うための設定は[こちらの記事](http://qiita.com/icb54615/items/af08862dfaefbf2bbcbe)が参考になります。
このBOTを使うには、追加で以下の設定が必要です。

## 設定する内容
設定ファイルはconfig.tomlです。
以下を設定して下さい。

* Slackのトークン　(上の記事で解説されています)
* [Mailgun](http://mailgun.com/)の設定。APIキーと送信元ドメイン。メールの自動送信に必要。ちなみにMailgunのアカウント取得は無料、月10,000通まで。

## BOTの起動
```bash
npm start
# or node kintai_bot.js
```

# TODO
+ 受信メッセージのまともな解析
