"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buyCar = exports.deleteCar = exports.updateCar = exports.addCar = exports.getCars = exports.deleteUser = exports.updateUser = exports.logout = exports.register = exports.login = exports.getUsers = void 0;
const index_1 = require("./index");
const db_1 = require("./db");
const getCurrentUserFromCookies = (req) => {
    try {
        const cookieHeader = req.headers.cookie;
        if (!cookieHeader)
            return null;
        const cookies = Object.fromEntries(cookieHeader.split(";").map((c) => {
            const [key, ...v] = c.trim().split("=");
            return [key, decodeURIComponent(v.join("="))];
        }));
        if (cookies.user) {
            return JSON.parse(cookies.user);
        }
    }
    catch (error) {
        console.error("Błąd parsowania ciasteczek:", error);
    }
    return null;
};
// =================== USERS ===================
const getUsers = async (req, res) => {
    var _a;
    try {
        const currentUser = getCurrentUserFromCookies(req);
        if (!currentUser) {
            res.writeHead(401, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: true, message: "Not logged in" }));
        }
        const parts = ((_a = req.url) === null || _a === void 0 ? void 0 : _a.split("/")) || [];
        const userId = parts.length > 2 ? parts[2] : null;
        if (userId) {
            const result = await db_1.pool.query("SELECT id, username, role, balance FROM users WHERE id=$1", [userId]);
            if (!result.rows.length) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: true, message: "User not found" }));
            }
            const user = result.rows[0];
            if (currentUser.role !== "admin" && currentUser.id !== user.id) {
                res.writeHead(403, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: true, message: "Access denied" }));
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(user));
        }
        if (currentUser.role === "admin") {
            const result = await db_1.pool.query("SELECT id, username, role, balance FROM users");
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(result.rows));
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(currentUser));
    }
    catch (err) {
        console.error(err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: true, message: "Server error" }));
    }
};
exports.getUsers = getUsers;
const login = async (req, res) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
        try {
            const { username, password } = JSON.parse(body);
            const result = await db_1.pool.query("SELECT id, username, role, balance, password FROM users WHERE username=$1", [username]);
            if (!result.rows.length) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: true, message: "User not found" }));
            }
            const user = result.rows[0];
            if (user.password !== password) {
                res.writeHead(401, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: true, message: "Invalid password" }));
            }
            delete user.password;
            res.writeHead(200, {
                "Content-Type": "application/json",
                "Set-Cookie": [`user=${encodeURIComponent(JSON.stringify(user))}; HttpOnly; Path=/`]
            });
            res.end(JSON.stringify({ success: true, user }));
        }
        catch (err) {
            console.error(err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: true, message: "Server error" }));
        }
    });
};
exports.login = login;
const register = async (req, res) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
        try {
            const { username, password } = JSON.parse(body);
            const exists = await db_1.pool.query("SELECT id FROM users WHERE username=$1", [username]);
            if (exists.rows.length) {
                res.writeHead(409, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: true, message: "Username exists" }));
            }
            const result = await db_1.pool.query("INSERT INTO users (username, password, role, balance) VALUES ($1, $2, 'user', 0) RETURNING id, username, role, balance", [username, password]);
            res.writeHead(201, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, user: result.rows[0] }));
        }
        catch (err) {
            console.error(err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: true, message: "Server error" }));
        }
    });
};
exports.register = register;
const logout = async (req, res) => {
    res.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": "user=; Max-Age=0; Path=/",
    });
    res.end(JSON.stringify({ success: true, message: "Logged out" }));
};
exports.logout = logout;
const updateUser = async (req, res) => {
    var _a;
    const currentUser = getCurrentUserFromCookies(req);
    if (!currentUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Not logged in" }));
    }
    const parts = ((_a = req.url) === null || _a === void 0 ? void 0 : _a.split("/")) || [];
    const userId = parts.length > 2 ? parts[2] : null;
    if (!userId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Missing user ID" }));
    }
    if (currentUser.role !== "admin" && currentUser.id !== userId) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Access denied" }));
    }
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", async () => {
        try {
            const data = JSON.parse(body);
            const fields = Object.keys(data)
                .map((key, i) => `${key}=$${i + 1}`)
                .join(", ");
            const values = Object.values(data);
            const result = await db_1.pool.query(`UPDATE users SET ${fields} WHERE id=$${values.length + 1} 
         RETURNING id, username, role, balance`, [...values, userId]);
            if (!result.rows.length) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: true, message: "User not found" }));
            }
            const updated = result.rows[0];
            (0, index_1.broadcastSSE)({ event: "user_updated", user: updated });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, user: updated }));
        }
        catch (err) {
            console.error("updateUser error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: true, message: "Server error" }));
        }
    });
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    var _a;
    const currentUser = getCurrentUserFromCookies(req);
    if (!currentUser || currentUser.role !== "admin") {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Access denied" }));
    }
    const parts = ((_a = req.url) === null || _a === void 0 ? void 0 : _a.split("/")) || [];
    const userId = parts.length > 2 ? parts[2] : null;
    if (!userId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Missing user ID" }));
    }
    try {
        await db_1.pool.query("DELETE FROM users WHERE id=$1", [userId]);
        (0, index_1.broadcastSSE)({ event: "user_deleted", userId });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "User deleted" }));
    }
    catch (err) {
        console.error("deleteUser error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: true, message: "Server error" }));
    }
};
exports.deleteUser = deleteUser;
// =================== CARS ===================
const getCars = async (_req, res) => {
    try {
        const result = await db_1.pool.query("SELECT * FROM cars ORDER BY id ASC");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.rows.map(car => ({
            id: car.id,
            model: car.model,
            price: car.price,
            ownerId: car.owner_id // <- poprawiona nazwa
        }))));
    }
    catch (error) {
        console.error("getCars error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: true, message: "Cannot get cars" }));
    }
};
exports.getCars = getCars;
const addCar = async (req, res) => {
    const currentUser = getCurrentUserFromCookies(req);
    if (!currentUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Not logged in" }));
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
        try {
            const { model, price } = JSON.parse(body);
            if (!model || !price) {
                throw new Error("Missing fields");
            }
            const result = await db_1.pool.query("INSERT INTO cars (model, price, owner_id) VALUES ($1, $2, $3) RETURNING *", [model, price, currentUser.id]);
            const car = result.rows[0];
            (0, index_1.broadcastSSE)({ event: "car_added", car });
            res.writeHead(201, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, car }));
        }
        catch (error) {
            console.error("addCar error:", error);
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: true, message: "Failed to add car" }));
        }
    });
};
exports.addCar = addCar;
const updateCar = async (req, res) => {
    var _a;
    const currentUser = getCurrentUserFromCookies(req);
    if (!currentUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Not logged in" }));
    }
    const parts = ((_a = req.url) === null || _a === void 0 ? void 0 : _a.split("/")) || [];
    const carId = parts.length > 2 ? parts[2] : null;
    if (!carId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Missing car ID" }));
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
        try {
            const updates = JSON.parse(body);
            const fields = Object.keys(updates)
                .map((k, i) => `${k}=$${i + 1}`)
                .join(", ");
            const values = Object.values(updates);
            const result = await db_1.pool.query(`UPDATE cars SET ${fields} WHERE id=$${values.length + 1} RETURNING *`, [...values, carId]);
            if (!result.rows.length) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: true, message: "Car not found" }));
            }
            const updated = result.rows[0];
            (0, index_1.broadcastSSE)({ event: "car_updated", car: updated });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, car: updated }));
        }
        catch (error) {
            console.error("updateCar error:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: true, message: "Update failed" }));
        }
    });
};
exports.updateCar = updateCar;
const deleteCar = async (req, res) => {
    var _a;
    const currentUser = getCurrentUserFromCookies(req);
    if (!currentUser || currentUser.role !== "admin") {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Access denied" }));
    }
    const parts = ((_a = req.url) === null || _a === void 0 ? void 0 : _a.split("/")) || [];
    const carId = parts.length > 2 ? parts[2] : null;
    if (!carId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Missing car ID" }));
    }
    try {
        await db_1.pool.query("DELETE FROM cars WHERE id=$1", [carId]);
        (0, index_1.broadcastSSE)({ event: "car_deleted", carId });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Car deleted" }));
    }
    catch (error) {
        console.error("deleteCar error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: true, message: "Delete failed" }));
    }
};
exports.deleteCar = deleteCar;
const buyCar = async (req, res) => {
    var _a, _b;
    const currentUser = getCurrentUserFromCookies(req);
    if (!currentUser) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Not logged in" }));
    }
    const parts = ((_a = req.url) === null || _a === void 0 ? void 0 : _a.split("/")) || [];
    const carId = parts.length > 2 ? parts[2] : null;
    if (!carId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Missing car ID" }));
    }
    try {
        // === 1. Pobierz auto ===
        const carResult = await db_1.pool.query("SELECT * FROM cars WHERE id=$1", [carId]);
        if (!carResult.rows.length) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: true, message: "Car not found" }));
        }
        const car = carResult.rows[0];
        // === 2. Nie kupuj własnego auta ===
        if (car.owner_id === currentUser.id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: true, message: "You already own this car" }));
        }
        // === 3. Pobierz kupującego ===
        const buyerResult = await db_1.pool.query("SELECT id, balance FROM users WHERE id=$1", [currentUser.id]);
        const buyer = buyerResult.rows[0];
        // === 4. Sprawdź środki ===
        if (buyer.balance < car.price) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: true, message: "Insufficient funds" }));
        }
        const sellerId = (_b = car.owner_id) !== null && _b !== void 0 ? _b : null;
        // === 5. Transakcja ===
        await db_1.pool.query("BEGIN");
        // Kupujący płaci
        await db_1.pool.query("UPDATE users SET balance = balance - $1 WHERE id=$2", [car.price, buyer.id]);
        // Sprzedający dostaje pieniądze – tylko jeśli istnieje
        if (sellerId) {
            await db_1.pool.query("UPDATE users SET balance = balance + $1 WHERE id=$2", [car.price, sellerId]);
        }
        // Właściciel auta zmieniony
        await db_1.pool.query("UPDATE cars SET owner_id = $1 WHERE id = $2", [buyer.id, car.id]);
        await db_1.pool.query("COMMIT");
        // === 6. Powiadomienie SSE ===
        (0, index_1.broadcastSSE)({
            event: "car_bought",
            carId: car.id,
            buyerId: buyer.id,
            sellerId: sellerId,
            timestamp: Date.now()
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            success: true,
            message: "Car purchased",
            car: {
                id: car.id,
                newOwnerId: buyer.id,
                oldOwnerId: sellerId
            }
        }));
    }
    catch (error) {
        await db_1.pool.query("ROLLBACK");
        console.error("buyCar error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: true, message: "Purchase failed" }));
    }
};
exports.buyCar = buyCar;
// =================== ADD MONEY ===================
async function addMoney(username, cash) {
    try {
        const result = await db_1.pool.query("UPDATE users SET balance = balance + $1 WHERE username = $2 RETURNING username, balance", [cash, username]);
        console.log("Money added:", result.rows[0]);
        return result.rows[0];
    }
    catch (error) {
        console.error("DB error:", error);
    }
}
// =================== TEST ===================
async function testAddMoney() {
    const username = "eeee"; // upewnij się, że taki użytkownik istnieje
    const cashToAdd = 100;
    const updatedUser = await addMoney(username, cashToAdd);
    console.log("Updated user balance:", updatedUser);
    await db_1.pool.end();
}
// Wywołanie funkcji testowej
testAddMoney();
