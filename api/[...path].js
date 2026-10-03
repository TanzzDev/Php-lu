// Satu Vercel Function untuk seluruh API (/api/*). Menjaga jumlah function tetap kecil
// (batas paket Hobby) dan berbagi cache katalog antar-request pada instance yang sama.
import { handleRequest } from '../server/router.js';

export default handleRequest;
