// PCで試すための小さなサーバー： node serve.js → http://localhost:5173
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(root, urlPath === "/" ? "index.html" : urlPath);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, { "Content-Type": (types[path.extname(file)] || "application/octet-stream") + "; charset=utf-8" });
      res.end(data);
    });
  })
  .on("error", (err) => {
    // すでに起動しているときは、そちらをそのまま使えばいいので正常終了
    if (err.code === "EADDRINUSE") {
      console.log("Already running: http://localhost:5173");
      process.exit(0);
    }
    throw err;
  })
  .listen(5173, () => console.log("Running: http://localhost:5173"));
