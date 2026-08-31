# 別のPCで開発環境を作る手順

Hub a Nice Day を新しいPCで開発・修正できるようにするための手順。
**Windowsのユーザー名は何でもよい**（`C:\Users\A` である必要はない）。スクリプトはすべて相対パスで動く。

---

## 0. 前提：入れるソフト

| ソフト | 用途 | 確認コマンド |
|---|---|---|
| **Git for Windows** | リポジトリ操作。Git Bash も一緒に入る | `git --version` |
| **Node.js**（v18以上。現行機は v24） | `port_to_main.js` / スモークテストの実行 | `node --version` |
| **Claude Code** | 開発 | `claude --version` |

`gh`（GitHub CLI）は現行機にも入っていない。**不要**。

---

## 1. 2つのリポジトリを「隣り合わせ」に置く（最重要）

`port_to_main.js` は自分の**1つ上の階層にある `hub-a-nice-day` フォルダ**を本番として探す
（`path.resolve(__dirname, '..', 'hub-a-nice-day')`）。
つまり置き場所はどこでもよいが、**この2つは必ず同じ親フォルダの直下**に、**この名前**で置くこと。

```
好きな場所（例: C:\Users\<自分の名前>\ や D:\dev\）
├── HUB-A-NICE-DAY-DEV     ← DEV
└── hub-a-nice-day         ← 本番（フォルダ名は必ずこれ。小文字）
```

Git Bash で、**置きたい親フォルダに移動してから**実行：

```bash
git clone https://github.com/Midorimotor-Inc/hub-a-nice-day-dev.git HUB-A-NICE-DAY-DEV
```

```bash
git clone https://github.com/Midorimotor-Inc/hub-a-nice-day.git
```

※ DEVはGitHub上の名前が小文字（`hub-a-nice-day-dev`）なので、
フォルダ名を `HUB-A-NICE-DAY-DEV` にするため clone の末尾に名前を指定している。

---

## 2. GitHubの認証

両リポジトリとも **Midorimotor-Inc（会社アカウント）** 配下。
初回の `git push` でブラウザのログイン画面が出るので、**Midorimotor-Inc のGitHubアカウント**でログインする。

> 注意：普段ブラウザでログインしているのが別アカウント（egachan28 など）だと、
> そのアカウントのまま認証されて push が 403 で弾かれる。
> **ブラウザ側を一度ログアウトするか、シークレットウィンドウで Midorimotor-Inc にログインする。**

うまくいかない場合は Windows の「資格情報マネージャー」→「Windows 資格情報」から
`git:https://github.com` の項目を削除して、もう一度 push すればやり直せる。

---

## 3. コミット者名の設定（clone直後に必ず）

**このシステムで使うアドレスは `hubaniceday.system@gmail.com`（会社アカウント）だけ。**
`kabu.midorimotors@gmail.com` と `ega.turbo.go.go.go@gmail.com` は**個人用。絶対に使わない。**
（過去にこの2つが混入していたため、2026-08-30に会社アカウントへ統一した）

新PCでは、まず全体の既定値を会社アカウントにしておく：

```bash
git config --global user.name "Midorimotor-Inc" && git config --global user.email "hubaniceday.system@gmail.com"
```

念のため、clone した各リポジトリにも明示的に設定する：

```bash
git -C HUB-A-NICE-DAY-DEV config user.name "Midorimotor-Inc" && git -C HUB-A-NICE-DAY-DEV config user.email "hubaniceday.system@gmail.com"
```

```bash
git -C hub-a-nice-day config user.name "Midorimotor-Inc" && git -C hub-a-nice-day config user.email "hubaniceday.system@gmail.com"
```

設定できたか確認（両方とも `hubaniceday.system@gmail.com` になっていること）：

```bash
git -C HUB-A-NICE-DAY-DEV config user.email && git -C hub-a-nice-day config user.email
```

---

## 4. スモークテスト用の Playwright を用意する

`CLAUDE.md` のルールで「**本番へ移植したら `node smoke_main.js` が PASS するまで push 禁止**」となっている。
そのため Playwright が必要。リポジトリの中ではなく**Tempの専用フォルダ**に入れる決まり：

```bash
mkdir -p "$LOCALAPPDATA/Temp/hub-verify" && cd "$LOCALAPPDATA/Temp/hub-verify" && npm init -y && npm i playwright && npx playwright install chromium-headless-shell
```

- スクリプト側が `%LOCALAPPDATA%\Temp\hub-verify\node_modules` を自動で探すので、これだけでよい。
- **Windowsのディスククリーンアップでこのフォルダは消える。** 消えたら上のコマンドをもう一度流せば復旧する。

---

## 5. 動作確認

```bash
cd HUB-A-NICE-DAY-DEV && node loaner_span_test.js && node insp_merge_test.js
```

これが通れば環境は完成。ブラウザで `index_dev.html` を直接開けば画面も見られる。

---

## 6. 知っておくこと

- **APIキー等を別途コピーする必要はない。** GAS_URL と GAS_API_KEY は HTML に直接書かれていて、
  リポジトリに入っている。clone すればそのまま本番GASに繋がる（＝DEVでも実データを触れるので注意）。
- **`.claude/settings.local.json` は同期されない。** これはコマンド許可の設定なので、
  新PCでは Claude Code の確認プロンプトが増えるだけ。使いながら許可していけばよい。
- **Claudeの記憶（memory）も同期されない。** 引き継ぎたい場合は現行機の
  `C:\Users\A\.claude\projects\C--Users-A\memory\` フォルダごと、新PCの同じ位置
  （`C:\Users\<新しい名前>\.claude\projects\<新パスの変換名>\memory\`）にコピーする。
  なくても `CLAUDE.md` がリポジトリに入っているので、プロジェクトのルールはClaudeに伝わる。
- **2台で並行して触らないこと。** 作業を始める前に必ず `git pull`、終わったら `git push`。
  両方のリポジトリで。片方だけ push し忘れると、次にもう一台で衝突する。

---

## 日々の作業の流れ（新PCでも同じ）

```bash
git -C HUB-A-NICE-DAY-DEV pull && git -C hub-a-nice-day pull
```

1. `index_dev.html` などを修正（バージョンは3ファイル揃えて上げる。`CLAUDE.md` 参照）
2. DEVをcommit & push → `https://midorimotor-inc.github.io/hub-a-nice-day-dev/` で確認
3. `node port_to_main.js` で本番へ移植
4. `node smoke_main.js` が PASS するのを確認
5. 本番をcommit & push → 青ヘッダー・[DEV]表記なしを目視確認
