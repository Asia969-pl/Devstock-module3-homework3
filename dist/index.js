"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sseHandler = sseHandler;
exports.broadcastSSE = broadcastSSE;
const http_1 = require("http");
const url_1 = require("url");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const db_1 = require("./db");
const routes_1 = require("./routes");
(0, db_1.testConnection)();
const PORT = 3000;
const frontEndDir = path.resolve(__dirname, "../frontend");
// =================== SSE ===================
const clients = [];
function sseHandler(req, res) {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
    });
    clients.push(res);
    req.on("close", () => {
        const index = clients.indexOf(res);
        if (index !== -1)
            clients.splice(index, 1);
    });
}
function broadcastSSE(eventData) {
    const payload = `data: ${JSON.stringify(eventData)}\n\n`;
    clients.forEach((client) => {
        try {
            client.write(payload);
        }
        catch (err) {
            console.error("SSE client write error:", err);
        }
    });
}
// =================== SERVER ===================
const server = (0, http_1.createServer)((req, res) => {
    const parsedUrl = (0, url_1.parse)(req.url || "/");
    const pathname = parsedUrl.pathname || "/";
    // ------------------- SSE -------------------
    if (pathname === "/sse" && req.method === "GET")
        return sseHandler(req, res);
    // ------------------- AUTH -------------------
    if (req.method === "POST" && pathname === "/login")
        return (0, routes_1.login)(req, res);
    if (req.method === "POST" && pathname === "/register")
        return (0, routes_1.register)(req, res);
    if (req.method === "POST" && pathname === "/logout")
        return (0, routes_1.logout)(req, res);
    // ------------------- USERS -------------------
    if (pathname.startsWith("/users/") && req.method === "PUT")
        return (0, routes_1.updateUser)(req, res);
    if (pathname.startsWith("/users/") && req.method === "DELETE")
        return (0, routes_1.deleteUser)(req, res);
    if (req.method === "GET" && pathname.startsWith("/users"))
        return (0, routes_1.getUsers)(req, res);
    // ------------------- CARS -------------------
    // BUY musi być PRZED ogólnym GET /cars
    if (pathname.startsWith("/cars/") && pathname.endsWith("/buy") && req.method === "POST")
        return (0, routes_1.buyCar)(req, res);
    if (req.method === "POST" && pathname === "/cars")
        return (0, routes_1.addCar)(req, res);
    if (pathname.startsWith("/cars/") && req.method === "DELETE")
        return (0, routes_1.deleteCar)(req, res);
    if (req.method === "GET" && pathname.startsWith("/cars"))
        return (0, routes_1.getCars)(req, res);
    // ------------------- STATIC FILES -------------------
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
