import { promises as fs } from "fs";
import { IncomingMessage, ServerResponse } from "http";
import { User, Car } from "./types";
import { broadcastSSE } from "./index";
import { pool } from "./db";

const getCurrentUserFromCookies = (req: IncomingMessage): User | null => {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const [key, ...v] = c.trim().split("=");
        return [key, decodeURIComponent(v.join("="))];
      })
    );

    if (cookies.user) {
      return JSON.parse(cookies.user);
    }
  } catch (error) {
    console.error("Błąd parsowania ciasteczek:", error);
  }
  return null;
};

export const getUsers = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const currentUser = getCurrentUserFromCookies(req);
    if (!currentUser) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: true, message: "Not logged in" }));
    }

    const parts = req.url?.split("/") || [];
    const userId = parts.length > 2 ? parts[2] : null;

    if (userId) {
      const result = await pool.query(
        "SELECT id, username, role, balance FROM users WHERE id=$1",
        [userId]
      );
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
      const result = await pool.query("SELECT id, username, role, balance FROM users");
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(result.rows));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(currentUser));

  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: true, message: "Server error" }));
  }
};

export const login = async (req: IncomingMessage, res: ServerResponse) => {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    try {
      const { username, password } = JSON.parse(body);
      const result = await pool.query(
        "SELECT id, username, role, balance, password FROM users WHERE username=$1",
        [username]
      );
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
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: true, message: "Server error" }));
    }
  });
};

export const register = async (req: IncomingMessage, res: ServerResponse) => {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    try {
      const { username, password } = JSON.parse(body);
      const exists = await pool.query(
        "SELECT id FROM users WHERE username=$1",
        [username]
      );
      if (exists.rows.length) {
        res.writeHead(409, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Username exists" }));
      }

      const result = await pool.query(
        "INSERT INTO users (username, password, role, balance) VALUES ($1, $2, 'user', 0) RETURNING id, username, role, balance",
        [username, password]
      );
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, user: result.rows[0] }));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: true, message: "Server error" }));
    }
  });
};

export const logout = async (_req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Set-Cookie": "user=; Max-Age=0; Path=/",
  });
  res.end(JSON.stringify({ success: true, message: "Logged out" }));
};

export const updateUser = async (req: IncomingMessage, res: ServerResponse) => {
  const currentUser = getCurrentUserFromCookies(req);
  if (!currentUser) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: true, message: "Not logged in" }));
  }

  const parts = req.url?.split("/") || [];
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
      const result = await pool.query(
        `UPDATE users SET ${fields} WHERE id=$${values.length + 1} RETURNING id, username, role, balance`,
        [...values, userId]
      );
      if (!result.rows.length) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "User not found" }));
      }

      const updated = result.rows[0];
      broadcastSSE({ event: "user_updated", user: updated });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, user: updated }));
    } catch (err) {
      console.error("updateUser error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: true, message: "Server error" }));
    }
  });
};

export const deleteUser = async (req: IncomingMessage, res: ServerResponse) => {
  const currentUser = getCurrentUserFromCookies(req);
  if (!currentUser || currentUser.role !== "admin") {
    res.writeHead(403, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: true, message: "Access denied" }));
  }

  const parts = req.url?.split("/") || [];
  const userId = parts.length > 2 ? parts[2] : null;
  if (!userId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: true, message: "Missing user ID" }));
  }

  try {
    await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    broadcastSSE({ event: "user_deleted", userId });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "User deleted" }));
  } catch (err) {
    console.error("deleteUser error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: true, message: "Server error" }));
  }
};

// Cars
export const getCars = async (_req: IncomingMessage, res: ServerResponse) => {
  try {
    const result = await pool.query("SELECT * FROM cars ORDER BY id ASC");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(
      result.rows.map(car => ({
        id: car.id,
        model: car.model,
        price: car.price,
        ownerId: car.owner_id
      }))
    ));
  } catch (error) {
    console.error("getCars error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: true, message: "Cannot get cars" }));
  }
};

export const addCar = async (req: IncomingMessage, res: ServerResponse) => {
  const currentUser = getCurrentUserFromCookies(req);
  if (!currentUser) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: true, message: "Not logged in" }));
  }

  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    try {
      const { model, price } = JSON.parse(body);
      if (!model || !price) throw new Error("Missing fields");

      const result = await pool.query(
        "INSERT INTO cars (model, price, owner_id) VALUES ($1, $2, $3) RETURNING *",
        [model, price, currentUser.id]
      );
      const car = result.rows[0];
      broadcastSSE({ event: "car_added", car });
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, car }));
    } catch (error) {
      console.error("addCar error:", error);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: true, message: "Failed to add car" }));
    }
  });
};

export const updateCar = async (req: IncomingMessage, res: ServerResponse) => {
  const currentUser = getCurrentUserFromCookies(req);
  if (!currentUser) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: true, message: "Not logged in" }));
  }

  const parts = req.url?.split("/") || [];
  const carId = parts.length > 2 ? parts[2] : null;
  if (!carId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: true, message: "Missing car ID" }));
  }

  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    try {
      const updates = JSON.parse(body);
      const fields = Object.keys(updates)
        .map((k, i) => `${k}=$${i + 1}`)
        .join(", ");
      const values = Object.values(updates);
      const result = await pool.query(
        `UPDATE cars SET ${fields} WHERE id=$${values.length + 1} RETURNING *`,
        [...values, carId]
      );
      if (!result.rows.length) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: true, message: "Car not found" }));
      }

      const updated = result.rows[0];
      broadcastSSE({ event: "car_updated", car: updated });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, car: updated }));
    } catch (error) {
      console.error("updateCar error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: true, message: "Update failed" }));
    }
  });
};

export const deleteCar = async (req: IncomingMessage, res: ServerResponse) => {
  const currentUser = getCurrentUserFromCookies(req);
  if (!currentUser || currentUser.role !== "admin") {
    res.writeHead(403, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: true, message: "Access denied" }));
  }

  const parts = req.url?.split("/") || [];
  const carId = parts.length > 2 ? parts[2] : null;
  if (!carId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: true, message: "Missing car ID" }));
  }

  try {
    await pool.query("DELETE FROM cars WHERE id=$1", [carId]);
    broadcastSSE({ event: "car_deleted", carId });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Car deleted" }));
  } catch (error) {
    console.error("deleteCar error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: true, message: "Delete failed" }));
  }
};

export const buyCar = async (req: IncomingMessage, res: ServerResponse) => {
  const currentUser = getCurrentUserFromCookies(req);
  if (!currentUser) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: true, message: "Not logged in" }));
  }

  const parts = req.url?.split("/") || [];
  const carId = parts.length > 2 ? parts[2] : null;
  if (!carId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: true, message: "Missing car ID" }));
  }

  try {
    const carResult = await pool.query("SELECT * FROM cars WHERE id=$1", [carId]);
    if (!carResult.rows.length) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: true, message: "Car not found" }));
    }

    const car = carResult.rows[0];
    if (car.owner_id === currentUser.id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: true, message: "You already own this car" }));
    }

    const buyerResult = await pool.query(
      "SELECT id, balance FROM users WHERE id=$1",
      [currentUser.id]
    );
    const buyer = buyerResult.rows[0];
    if (buyer.balance < car.price) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: true, message: "Insufficient funds" }));
    }

    const sellerId = car.owner_id ?? null;
    await pool.query("BEGIN");
    await pool.query("UPDATE users SET balance = balance - $1 WHERE id=$2", [car.price, buyer.id]);
    if (sellerId) await pool.query("UPDATE users SET balance = balance + $1 WHERE id=$2", [car.price, sellerId]);
    await pool.query("UPDATE cars SET owner_id = $1 WHERE id = $2", [buyer.id, car.id]);
    await pool.query("COMMIT");

    broadcastSSE({ event: "car_bought", carId: car.id, buyerId: buyer.id, sellerId: sellerId, timestamp: Date.now() });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Car purchased", car: { id: car.id, newOwnerId: buyer.id, oldOwnerId: sellerId } }));
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error("buyCar error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: true, message: "Purchase failed" }));
  }
};

async function addMoney(username: string, cash: number) {
  try {
    const result = await pool.query(
      "UPDATE users SET balance = balance + $1 WHERE username = $2 RETURNING username, balance",
      [cash, username]
    );
    console.log("Money added:", result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error("DB error:", error);
  }
}

async function testAddMoney() {
  const username = "eeee";
  const cashToAdd = 100;
  const updatedUser = await addMoney(username, cashToAdd);
  console.log("Updated user balance:", updatedUser);
  await pool.end();
}

testAddMoney();
