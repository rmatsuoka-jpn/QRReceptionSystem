# Third-party notices / 外部ライブラリのライセンス

QR受付システムの独自コードには、リポジトリ直下の [MIT License](LICENSE) が適用されます。
`vendor/` に同梱された第三者ライブラリには、各著作権者のライセンスが個別に適用されます。
本体のMITライセンスが第三者ライブラリのライセンスを変更することはありません。

## 同梱ライブラリ

| ライブラリ | バージョン | ファイル | ライセンス | ライセンス全文 |
| --- | --- | --- | --- | --- |
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) | 2.3.8 | `vendor/html5-qrcode.min.js` | Apache License 2.0 | [vendor/LICENSE-html5-qrcode.txt](vendor/LICENSE-html5-qrcode.txt) |
| [qrcodejs](https://github.com/davidshimjs/qrcodejs) | 1.0.0 | `vendor/qrcode.min.js` | MIT License | [vendor/LICENSE-qrcodejs.txt](vendor/LICENSE-qrcodejs.txt) |
| [JSZip](https://github.com/Stuk/jszip) | 3.10.1 | `vendor/jszip.min.js` | MIT License **または** GPLv3（本アプリではMITを選択） | [vendor/LICENSE-jszip.txt](vendor/LICENSE-jszip.txt) |

これらのライセンス文書は元の著作権・許諾表示を維持して同梱しています。

## ライブラリに組み込まれた依存コード

以下は個別ファイルとして直接読み込むものではなく、同梱ライブラリの内部で使用されるコードです。

### ZXing for JS (`@zxing/library`)

- 用途：`html5-qrcode` のバーコード／QRコード解析
- ライセンス：Apache License 2.0
- 開発元：[zxing-js/library](https://github.com/zxing-js/library)
- ライセンス本文：[ZXing for JS/LICENSE](https://github.com/zxing-js/library/blob/master/LICENSE)
- 同じApache License 2.0の全文は [vendor/LICENSE-html5-qrcode.txt](vendor/LICENSE-html5-qrcode.txt) にも収録しています。

### pako

- 用途：JSZipに組み込まれた圧縮・展開処理
- ライセンス：MIT License
- 開発元：[nodeca/pako](https://github.com/nodeca/pako)
- JSZipの配布ファイル自体にもpakoの利用とライセンスへの参照が記載されています。
- 以下にpakoのライセンス表示と全文を転載します。

```text
(The MIT License)

Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

この一覧は2026年11月6日時点の同梱ファイルに基づきます。ライブラリの追加・更新時には、配布物に含まれる著作権表示と依存コードも確認してください。
