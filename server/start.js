import "dotenv/config";
import app from "./index.js";
import { initializeDatabase } from "./db.js";

await initializeDatabase();
const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Pets PetShop API pronta em http://localhost:${port}`));
