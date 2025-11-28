import { createServer, IncomingMessage, ServerResponse } from "http";
import { parse as parseUrl } from "url";
import * as fs from "fs";
import * as path from "path";
import { testConnection } from "./db";
import {
  getUsers,
  getCars,
  login,
  register,
  updateUser,
  deleteUser,
  addCar,
  deleteCar,
  logout,
  buyCar,
} from "./routes";

testConnection();

const PORT = 3000;
const frontEndDir = path.resolve(__dirname, "../frontend");

const clients: ServerResponse[] = [];

export function sseHandler(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  clients.push(res);

  req.on("close", () => {
    const index = clients.indexOf(res);
    if (index !== -1) clients.splice(index, 1);
  });
}

export function broadcastSSE(eventData: any) {
  const payload = `data: ${JSON.stringify(eventData)}\n\n`;
  clients.forEach((client) => {
    try {
      client.write(payload);
    } catch (err) {
      console.error("SSE client write error:", err);
    }
  });
}

// =================== SERVER ===================
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const parsedUrl = parseUrl(req.url || "/");
  const pathname = parsedUrl.pathname || "/";

  if (pathname === "/sse" && req.method === "GET") return sseHandler(req, res);

  if (req.method === "POST" && pathname === "/login") return login(req, res);
  if (req.method === "POST" && pathname === "/register") return register(req, res);
  if (req.method === "POST" && pathname === "/logout") return logout(req, res);

  // ------------------- USERS -------------------
  if (pathname.startsWith("/users/") && req.method === "PUT") return updateUser(req, res);
  if (pathname.startsWith("/users/") && req.method === "DELETE") return deleteUser(req, res);
  if (req.method === "GET" && pathname.startsWith("/users")) return getUsers(req, res);

  // ------------------- CARS -------------------
  // BUY musi być PRZED ogólnym GET /cars
  if (pathname.startsWith("/cars/") && pathname.endsWith("/buy") && req.method === "POST")
    return buyCar(req, res);

  if (req.method === "POST" && pathname === "/cars") return addCar(req, res);
  if (pathname.startsWith("/cars/") && req.method === "DELETE") return deleteCar(req, res);
  if (req.method === "GET" && pathname.startsWith("/cars")) return getCars(req, res);


  const filePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const absPath = path.join(frontEndDir, filePath);
  const ext = path.extname(absPath).toLowerCase();

  let contentType = "application/octet-stream";
  switch (ext) {
    case ".html":
      contentType = "text/html; charset=UTF-8";
      break;
    case ".css":
      contentType = "text/css; charset=UTF-8";
      break;
    case ".js":
      contentType = "application/javascript; charset=UTF-8";
      break;
    case ".json":
      contentType = "application/json; charset=UTF-8";
      break;
  }

  fs.readFile(absPath, (err, data) => {
    if (err) {
      const indexPath = path.join(frontEndDir, "index.html");
      fs.readFile(indexPath, (indexErr, indexData) => {
        if (indexErr) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/html; charset=UTF-8");
          return res.end("<h1>404 - Not Found</h1>");
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=UTF-8");
        res.end(indexData);
      });
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
