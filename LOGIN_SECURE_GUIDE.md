# Guía: Login Seguro con HttpOnly Cookies + JWT
## Explicada línea por línea para principiantes

---

## ¿Qué vamos a construir y por qué?

Imagina que tu app tiene un portero en la puerta. Cuando alguien llega, le pide
su DNI (usuario + contraseña). Si es correcto, el portero le da una **pulsera
especial** (el JWT). Desde ese momento, para entrar a cualquier sala basta con
mostrar la pulsera — no hace falta volver a pedir el DNI.

Esa "pulsera" es el **JWT** (JSON Web Token). El truco de seguridad es guardarla
en una **cookie HttpOnly**: el navegador la guarda automáticamente y la envía en
cada petición, pero **ningún código JavaScript puede leerla**. Eso la protege de
ataques XSS donde código malicioso intenta robar tus credenciales.

---

## ¿Por qué cookie HttpOnly y no localStorage?

| Pregunta | localStorage | Cookie HttpOnly |
|---|---|---|
| ¿JavaScript puede leerla? | ✅ Sí — peligroso | ❌ No — seguro |
| ¿Vulnerable a XSS? | ✅ Sí | ❌ No |
| ¿Vulnerable a CSRF? | ❌ No | ⚠️ Mitigado con `SameSite=Strict` |
| ¿Se envía automáticamente? | No, hay que hacerlo manual | Sí, el navegador la incluye siempre |

> **XSS** = Cross-Site Scripting: un atacante inyecta código JS malicioso que
> roba el token de localStorage. Con HttpOnly, aunque inyecte código, **no puede
> leer la cookie**.

---

## Flujo completo explicado paso a paso

```
REGISTRO
──────────────────────────────────────────────────────────────────────
 1. React  →  POST /api/auth/register  { name, email, password }
 2. Backend convierte "MiPass123" → "$2b$12$...hash..." (bcrypt)
 3. Guarda en Oracle: INSERT INTO users (name, email, password_hash)
 4. Responde: { success: true, message: "Usuario registrado" }

LOGIN
──────────────────────────────────────────────────────────────────────
 1. React  →  POST /api/auth/login  { email, password }
 2. Backend busca el usuario por email en Oracle
 3. Compara la contraseña con el hash guardado (bcrypt.compare)
 4. Si es correcto, crea un JWT: { sub: 5, email: "user@x.com" }
 5. Mete el JWT en una cookie HttpOnly y responde:
    Set-Cookie: access_token=eyJhb...; HttpOnly; Secure; SameSite=Strict
 6. El navegador guarda la cookie automáticamente

RUTAS PROTEGIDAS (ej: /api/auth/me)
──────────────────────────────────────────────────────────────────────
 1. React  →  GET /api/auth/me
    (el navegador envía la cookie automáticamente en este request)
 2. El middleware "protect" lee la cookie: req.cookies.access_token
 3. Verifica que el JWT es válido y no ha expirado
 4. Agrega req.user = { sub: 5, email: "user@x.com" }
 5. Responde: { success: true, user: { sub: 5, email: "..." } }

LOGOUT
──────────────────────────────────────────────────────────────────────
 1. React  →  POST /api/auth/logout
 2. Backend responde con Set-Cookie que sobreescribe la cookie con
    una fecha de expiración en el pasado → el navegador la elimina
```

---

## PASO 0 — Instalación de paquetes

```bash
# Paquetes que usa el servidor en producción
npm install jsonwebtoken cookie-parser bcrypt

# Definiciones de tipos para TypeScript
npm install --save-dev @types/jsonwebtoken @types/cookie-parser @types/bcrypt
```

**¿Para qué sirve cada paquete?**

| Paquete | Para qué sirve |
|---|---|
| `jsonwebtoken` | Crear y verificar tokens JWT |
| `cookie-parser` | Leer las cookies que llegan en los requests (`req.cookies`) |
| `bcrypt` | Convertir contraseñas en hashes seguros y compararlas |
| `dotenv` | Leer variables secretas del archivo `.env` |

---

## PASO 0.1 — El archivo `.env`

El archivo `.env` guarda **datos secretos** que NO deben ir en el código fuente.
Si subes ese archivo a GitHub, cualquiera podría ver tus credenciales.

```env
# ── Base de datos Oracle ──────────────────────────────
DB_USER=system
DB_PASS=tu_contraseña_oracle
DB_CONN=localhost/XEPDB1

# ── JWT ───────────────────────────────────────────────
# Genera un secreto aleatorio con:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=pega_aqui_el_secreto_generado_de_128_caracteres
JWT_EXPIRES_IN=15m        # el token expira en 15 minutos

# ── Entorno ───────────────────────────────────────────
NODE_ENV=development      # cámbialo a "production" cuando subas al servidor

# ── URL del frontend ──────────────────────────────────
FRONTEND_URL=http://localhost:5173   # el puerto donde corre Vite/React
```

**¿Por qué `JWT_EXPIRES_IN=15m`?**
Si alguien roba el token y dura para siempre, el atacante tiene acceso indefinido.
Con 15 minutos, el daño es muy limitado.

> ⚠️ Agrega `.env` a tu `.gitignore` para que **nunca** se suba a GitHub.

---

## PASO 1 — Tabla Oracle: columna `password_hash`

**¿Por qué no guardamos la contraseña directamente?**

Porque si alguien roba tu base de datos, no debe poder leer las contraseñas.
Guardamos solo el **hash** — una transformación matemática irreversible. Cuando
el usuario inicia sesión, transformamos lo que escribe y comparamos los dos hashes.
Nunca guardamos ni comparamos la contraseña en texto plano.

```sql
-- Si la tabla ya existe, solo agrega la columna nueva:
ALTER TABLE users ADD (password_hash VARCHAR2(60));

-- Si estás creando la tabla desde cero:
CREATE TABLE users (
    id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- IDENTITY = Oracle genera el ID automáticamente (1, 2, 3...)

    name          VARCHAR2(100)  NOT NULL,
    -- NOT NULL = el campo es obligatorio, no puede quedar vacío

    email         VARCHAR2(150)  NOT NULL UNIQUE,
    -- UNIQUE = no pueden existir dos usuarios con el mismo email

    password_hash VARCHAR2(60)   NOT NULL
    -- bcrypt siempre produce exactamente 60 caracteres
);
```

> **¿Por qué exactamente 60?** bcrypt siempre produce un hash de ese largo,
> sin importar qué tan larga sea la contraseña original.

---

## PASO 2 — Utilidad JWT (`src/utils/jwt.ts`)

Este archivo es el "fabricante de pulseras". Tiene dos funciones:
`signToken` (crea el token) y `verifyToken` (comprueba si es válido).

```typescript
import jwt from 'jsonwebtoken';
// Importamos la librería jsonwebtoken que instalamos

const SECRET = process.env.JWT_SECRET as string;
// Leemos el secreto del archivo .env
// Este secreto es como la "tinta especial" con que firmamos los tokens
// Nadie puede falsificar un token sin conocer este secreto

const EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? '15m') as string;
// Tiempo de vida del token
// ?? '15m' significa: si no está definido en .env, usa 15 minutos por defecto

export interface JwtPayload {
    sub: number;   // sub = "subject" = quién es el usuario (su ID en Oracle)
    email: string; // email del usuario
    // ⚠️ NO incluyas la contraseña aquí
    // El payload del JWT está codificado en base64, NO cifrado
    // Cualquiera puede decodificarlo, pero no falsificarlo sin el SECRET
}

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    // Omit<..., 'iat' | 'exp'> = el payload que recibimos no trae iat ni exp
    // porque jwt.sign los agrega automáticamente:
    //   iat = issued at = cuándo se creó el token (timestamp Unix)
    //   exp = expires at = cuándo expira (timestamp Unix)

    if (!SECRET) throw new Error('JWT_SECRET no está definido en .env');
    // Si olvidaste definir el secreto, el servidor falla con un error claro
    // en lugar de funcionar de forma insegura con undefined

    return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions);
    // jwt.sign(datos, secreto, opciones) → devuelve el token como string
    // Ejemplo: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.abc123"
    //           ─── header ──────────  ─── payload ─  ─ firma ─
}

export function verifyToken(token: string): JwtPayload {
    if (!SECRET) throw new Error('JWT_SECRET no está definido en .env');

    return jwt.verify(token, SECRET) as unknown as JwtPayload;
    // jwt.verify verifica que:
    //   1. La firma es válida (nadie alteró el token)
    //   2. El token no ha expirado
    // Si alguna de las dos falla → lanza una excepción automáticamente
    // "as unknown as JwtPayload" es necesario por un conflicto de tipos de TS
}
```

---

## PASO 3 — Middleware de protección (`src/middlewares/auth.middleware.ts`)

Un **middleware** es una función que se ejecuta **antes** del controlador.
Actúa como el portero de una sala exclusiva: revisa la "pulsera" (cookie)
y solo deja pasar si es válida.

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';

export interface AuthRequest extends Request {
    user?: JwtPayload;
    // Extendemos el tipo Request de Express para agregar la propiedad "user"
    // Sin esta extensión, TypeScript no sabría que req.user existe
    // y nos daría error al intentar usarlo en los controladores
}

export function protect(req: AuthRequest, res: Response, next: NextFunction): void {
    const token: string | undefined = req.cookies?.access_token;
    // req.cookies = objeto con todas las cookies que llegaron en la petición
    // .access_token = nombre de nuestra cookie (el mismo que usamos al crearla)
    // El "?." evita un error si req.cookies es undefined por alguna razón

    if (!token) {
        // Si no hay cookie, el usuario no está logueado → rechazamos la petición
        res.status(401).json({ success: false, message: 'No autorizado: token no encontrado' });
        // 401 = Unauthorized (no autenticado, diferente a 403 Forbidden que es "autenticado pero sin permiso")
        return;
        // El "return" es obligatorio aquí
        // Sin él, TypeScript reporta error porque next() también podría llamarse
    }

    try {
        req.user = verifyToken(token);
        // Verificamos la firma del token y que no haya expirado
        // Si es válido, guardamos los datos del usuario en req.user
        // El controlador puede acceder a req.user.email, req.user.sub, etc.

        next();
        // next() = "todo correcto, pasa al siguiente middleware o controlador"
    } catch {
        // verifyToken lanza excepción si:
        //   - El token fue alterado (JsonWebTokenError)
        //   - El token expiró hace más de maxAge ms (TokenExpiredError)
        res.status(401).json({ success: false, message: 'Token inválido o expirado' });
    }
}
```

**Flujo visual:**
```
Request llega a una ruta protegida
          │
          ▼
  ¿Existe req.cookies.access_token?
          │
        No ──► 401 "Token no encontrado" ──► FIN
          │
        Sí
          │
          ▼
  ¿El JWT tiene firma válida y no expiró?
          │
        No ──► 401 "Token inválido o expirado" ──► FIN
          │
        Sí
          │
          ▼
  req.user = { sub: 5, email: "user@x.com" }
          │
          ▼
       next() → pasa al controlador
```

---

## PASO 4 — Servicio de autenticación (`src/services/auth.service.ts`)

El servicio contiene la **lógica de negocio**: hashear contraseñas,
buscar en Oracle, generar tokens.

### Función `register`

```typescript
import bcrypt from 'bcrypt';
import OracleDB from 'oracledb';
import { getConnection } from '../config/db';
import { signToken } from '../utils/jwt';

export interface RegisterDto {
    name: string;
    email: string;
    password: string;  // contraseña en texto plano que envió el usuario
}

export interface LoginDto {
    email: string;
    password: string;
}

const SALT_ROUNDS = 12;
// Salt rounds = cuántas veces bcrypt procesa la contraseña internamente
// Más alto = más seguro pero más lento de calcular
// Con 12: ~300ms en una CPU moderna (aceptable para el usuario)
// Para un atacante probando millones de contraseñas, 300ms por intento = impracticable

export async function register(dto: RegisterDto): Promise<void> {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    // bcrypt.hash("MiPass123", 12) → "$2b$12$N9qo8uLOickgx2ZMRZpBhe..."
    // Ese hash de 60 caracteres es lo que guardamos en Oracle
    // Es imposible revertirlo para obtener "MiPass123" original

    const conn = await getConnection();
    // Pedimos una conexión del pool que creamos en config/db.ts

    try {
        await conn.execute(
            `INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :passwordHash)`,
            // Los :parametros (bind variables) son la protección contra SQL Injection
            // Oracle sustituye los valores de forma segura internamente
            // NUNCA hagas: `INSERT INTO users VALUES ('${name}')` → SQL Injection!

            { name: dto.name, email: dto.email, passwordHash },
            // Objeto que mapea cada :parametro con su valor real

            { autoCommit: true }
            // Confirma la transacción automáticamente (equivale a COMMIT en Oracle)
        );
    } finally {
        await conn.close();
        // "finally" se ejecuta SIEMPRE: con éxito o con error
        // Esto garantiza que la conexión siempre vuelva al pool
        // Si nunca cerramos conexiones, el pool se agota y el servidor deja de responder
    }
}
```

### Función `login`

```typescript
export async function login(dto: LoginDto): Promise<string> {
    // Retorna el JWT como string si las credenciales son correctas

    const conn = await getConnection();
    let row: [number, string, string] | undefined;
    // Tipo del array: [id_usuario, email, password_hash]

    try {
        const result = await conn.execute<[number, string, string]>(
            `SELECT id, email, password_hash FROM users WHERE email = :email`,
            { email: dto.email },
            // :email está protegido contra SQL Injection
            { outFormat: OracleDB.OUT_FORMAT_ARRAY }
            // Devuelve la fila como array [1, "darwin@...", "$2b$12$..."]
            // En lugar de objeto { ID: 1, EMAIL: "..." }
        );
        row = result.rows?.[0];
        // .rows?.[0] = primera (y única) fila, o undefined si no existe el email
    } finally {
        await conn.close();
    }

    // ─── Mensaje genérico para los dos casos de error ────────────────────────
    if (!row) {
        throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
        // Si dijéramos "Ese email no existe", un atacante podría probar emails
        // hasta descubrir cuáles están registrados (ataque de "user enumeration")
        // Con el mismo mensaje para todo, no revelamos si el email existe o no
    }

    const [id, email, hash] = row;
    // Desestructuramos: id = row[0], email = row[1], hash = row[2]

    const valid = await bcrypt.compare(dto.password, hash);
    // bcrypt.compare("MiPass123", "$2b$12$N9qo8...") → true o false
    // bcrypt extrae el "salt" del hash guardado y rehashea la contraseña enviada
    // Compara los resultados internamente de forma segura (timing-safe)
    // No es posible revertir el hash — solo compararlo

    if (!valid) {
        throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
        // Mismo mensaje que antes → no revelamos si el error fue el email o la contraseña
    }

    return signToken({ sub: id, email });
    // Creamos el JWT con el ID y email del usuario
    // Este token irá en la cookie HttpOnly que setea el controlador
}
```

---

## PASO 5 — Validadores (`src/middlewares/auth.validator.ts`)

Los validadores revisan que los datos del formulario sean correctos **antes**
de que lleguen al servicio. Si hay un error, responden con 400 directamente
y no se ejecuta nada más (no hay consultas a Oracle).

```typescript
import { body, ValidationChain } from 'express-validator';

export const registerValidator: ValidationChain[] = [
    body('name')
        .notEmpty().withMessage('El nombre es requerido')
        // notEmpty() rechaza: "", null, undefined, "   " (solo espacios)
        .isLength({ min: 3 }).withMessage('Mínimo 3 caracteres'),
        // Rechaza nombres de 1 o 2 caracteres

    body('email')
        .isEmail().withMessage('Email inválido')
        // Verifica formato usuario@dominio.com
        .normalizeEmail(),
        // Convierte a minúsculas: "ANA@GMAIL.COM" → "ana@gmail.com"
        // Evita que el mismo email se registre como "Ana@gmail.com" y "ana@gmail.com"

    body('password')
        .isLength({ min: 8 }).withMessage('Mínimo 8 caracteres')
        .matches(/[A-Z]/).withMessage('Debe contener al menos una mayúscula')
        // /[A-Z]/ = expresión regular: ¿hay al menos un carácter entre A y Z mayúscula?
        .matches(/[0-9]/).withMessage('Debe contener al menos un número'),
        // /[0-9]/ = ¿hay al menos un dígito del 0 al 9?
];

export const loginValidator: ValidationChain[] = [
    body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
    body('password').notEmpty().withMessage('La contraseña es requerida'),
    // En login solo validamos formato básico, NO las reglas de complejidad
    // (las reglas estrictas como mayúsculas son solo para el registro)
];
```

---

## PASO 6 — Controlador (`src/controllers/auth.controllers.ts`)

El controlador decide qué cookie setear, cuánto tiempo dura y con
qué atributos de seguridad.

```typescript
import { Request, Response, NextFunction } from 'express';
import * as service from '../services/auth.service';
import { AuthRequest } from '../middlewares/auth.middleware';

const COOKIE_NAME = 'access_token';
// Nombre de la cookie — debe ser el mismo en login, logout y el middleware protect

const isProd = process.env.NODE_ENV === 'production';
// true = estamos en el servidor real, false = estamos en nuestra máquina local

const cookieOptions = {
    httpOnly: true,
    // ─── SEGURIDAD #1: invisible para JavaScript ───────────────────────────
    // document.cookie NO mostrará esta cookie
    // fetch() y axios NO pueden leerla aunque lo intenten
    // Esto bloquea ataques XSS donde código malicioso roba el token

    secure: isProd,
    // ─── SEGURIDAD #2: solo por HTTPS en producción ────────────────────────
    // En desarrollo (localhost) no hay HTTPS, por eso usamos false
    // En producción SIEMPRE debe ser true — sin HTTPS el token viaja en claro

    sameSite: 'strict' as const,
    // ─── SEGURIDAD #3: protección CSRF ─────────────────────────────────────
    // 'strict' = la cookie NO se envía si el request viene de otro dominio
    // Ejemplo: si estás en maliweb.com y hace un fetch a tuapp.com,
    // el navegador NO incluirá la cookie → el ataque CSRF falla

    maxAge: 15 * 60 * 1000,
    // Tiempo de vida en MILISEGUNDOS
    // 15 minutos × 60 segundos × 1000ms = 900.000ms
    // Pasado este tiempo, el navegador elimina la cookie automáticamente

    path: '/',
    // La cookie se envía en TODAS las rutas del dominio
    // (no solo en /api/auth/*)
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await service.register(req.body);
        // req.body = { name: "Darwin", email: "...", password: "Segura123" }
        // llegó del formulario React y ya fue validado por registerValidator

        res.status(201).json({ success: true, message: 'Usuario registrado correctamente' });
        // 201 Created = se creó un nuevo recurso (diferente a 200 OK que es solo "todo bien")
    } catch (err) {
        next(err);
        // Si Oracle devuelve ORA-00001 (email duplicado), el errorHandler lo convierte
        // en un mensaje legible: "Registro duplicado"
    }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token = await service.login(req.body);
        // Si las credenciales son incorrectas, service.login lanza una excepción
        // y saltamos directo al catch → nunca llegamos a res.cookie()

        res.cookie(COOKIE_NAME, token, cookieOptions);
        // Agrega el header Set-Cookie a la respuesta HTTP:
        // Set-Cookie: access_token=eyJhb...; HttpOnly; SameSite=Strict; Max-Age=900; Path=/
        // El navegador recibe este header y guarda la cookie automáticamente

        res.json({ success: true, message: 'Login exitoso' });
        // NOTA IMPORTANTE: el token NO va en el body de la respuesta
        // Solo está en la cookie, que JavaScript no puede leer
    } catch (err) {
        next(err);
    }
};

export const logout = (_req: Request, res: Response): void => {
    // _req = no usamos el request, el guión bajo es convención para indicarlo

    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        path: '/',
        // Estas opciones deben coincidir EXACTAMENTE con las del login
        // Si difieren aunque sea en una propiedad, el navegador no eliminará la cookie
    });
    // clearCookie envía: Set-Cookie: access_token=; Max-Age=0; Expires=Thu, 01 Jan 1970...
    // El navegador interpreta "expirado en el pasado" como "eliminar esta cookie"

    res.json({ success: true, message: 'Sesión cerrada correctamente' });
};

export const me = (req: AuthRequest, res: Response): void => {
    // Este controlador SOLO llega aquí si el middleware "protect" lo permitió
    // Es decir, req.user YA contiene los datos del token verificado
    res.json({ success: true, user: req.user });
    // Ejemplo de respuesta: { success: true, user: { sub: 5, email: "darwin@..." } }
};
```

---

## PASO 7 — Rutas (`src/routes/auth.routes.ts`)

Las rutas conectan las URLs con sus middlewares y controladores.

```typescript
import { Router } from 'express';
import * as c from '../controllers/auth.controllers';
import validate from '../middlewares/validate';
import { registerValidator, loginValidator } from '../middlewares/auth.validator';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

router.post('/register', registerValidator, validate, c.register);
// Al llegar POST /api/auth/register, Express ejecuta en orden:
//   1. registerValidator → define las reglas de validación
//   2. validate          → revisa si hay errores; si los hay, responde 400 y para
//   3. c.register        → si todo bien, crea el usuario en Oracle

router.post('/login', loginValidator, validate, c.login);
// Igual que register, pero con las reglas del loginValidator

router.post('/logout', protect, c.logout);
// protect primero: verifica que el usuario esté logueado
// No tiene sentido hacer logout sin estar logueado

router.get('/me', protect, c.me);
// protect lee y verifica la cookie
// Si es válida, agrega req.user y pasa a c.me
// c.me simplemente devuelve req.user

export default router;
```

---

## PASO 8 — `app.ts` — Punto de entrada del servidor

```typescript
import dotenv from 'dotenv';
dotenv.config();
// ─── PRIMERA LÍNEA OBLIGATORIA ──────────────────────────────────────────────
// dotenv.config() lee el archivo .env y guarda cada variable en process.env
// Si esto NO va primero, cuando cors() se registre y lea process.env.FRONTEND_URL
// obtendrá "undefined". El paquete cors interpreta undefined como "todos los orígenes"
// y enviará: Access-Control-Allow-Origin: *
// El navegador BLOQUEA las cookies cuando el origen es *, dando el error CORS.
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { initDB } from './config/db';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import productRoutes from './routes/product.routes';
import errorHandler from './middlewares/error.middleware';

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    // Permite SOLO las peticiones que vengan de esta URL
    // Peticiones de cualquier otro origen serán bloqueadas por el navegador
    // "?? 'http://localhost:5173'" = si FRONTEND_URL no está en .env, usa este valor por defecto

    credentials: true,
    // ← OBLIGATORIO para que el navegador acepte y envíe cookies cross-origin
    // "cross-origin" = el backend (puerto 3000) y el frontend (puerto 5173) son orígenes distintos
    // Sin credentials: true, el navegador descarta la cookie del Set-Cookie
    // React también necesita withCredentials: true en axios (ver PASO 10)
}));

app.use(helmet());
// Agrega automáticamente headers de seguridad HTTP:
// X-Frame-Options: DENY             → previene clickjacking
// X-Content-Type-Options: nosniff   → previene MIME sniffing
// Content-Security-Policy           → restringe recursos que puede cargar la página

app.use(express.json());
// Permite que Express lea el body de los requests como JSON
// Sin esto, req.body sería undefined en todos los controladores

app.use(cookieParser());
// ← OBLIGATORIO para leer cookies
// Sin esto, req.cookies sería undefined y el middleware protect
// nunca encontraría el token → todos aparecerían como no autenticados

app.use('/api/auth', authRoutes);
// Registra las rutas: /api/auth/login, /api/auth/register, etc.

app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);

initDB();
// Conecta a Oracle y crea el pool de conexiones

app.listen(3000, () => console.log('Servidor en http://localhost:3000'));

app.use(errorHandler);
// El errorHandler DEBE ir AL FINAL de todo
// Express sabe que es un manejador de errores porque tiene 4 parámetros: (err, req, res, next)
// Si va antes de las rutas, los errores de esas rutas no llegarían a él
```

---

## PASO 9 — Proteger rutas existentes

Para que una ruta requiera login, agrega `protect` como primer middleware:

```typescript
// src/routes/product.routes.ts
import { protect } from '../middlewares/auth.middleware';

router.get('/', c.getAll);
// Pública: cualquiera puede ver la lista de productos sin logueo

router.post('/', protect, c.create);
// Privada: protect verifica el token antes de ejecutar c.create
// Si no hay token válido, protect responde 401 y c.create NUNCA se ejecuta

router.put('/:id', protect, c.update);
router.delete('/:id', protect, c.remove);
```

---

## PASO 10 — Integración con React

### `src/lib/axios.ts` — Configuración global

```typescript
import axios from 'axios';

export const api = axios.create({
    baseURL: 'http://localhost:3000/api',
    // Prefijo de todas las URLs: api.get('/auth/me') llama a localhost:3000/api/auth/me

    withCredentials: true,
    // ← OBLIGATORIO en el lado React
    // Le dice al navegador: "incluye las cookies en este request aunque sean cross-origin"
    // Sin esto, la cookie del login nunca se enviará en requests posteriores
    // y el middleware protect siempre verá req.cookies.access_token como undefined
});
```

### `src/services/auth.service.ts` (React)

```typescript
import { api } from '../lib/axios';

export async function register(name: string, email: string, password: string) {
    const { data } = await api.post('/auth/register', { name, email, password });
    return data;
}

export async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password });
    // El servidor responde con Set-Cookie: access_token=eyJhb...; HttpOnly
    // El navegador guarda la cookie automáticamente (gracias a withCredentials: true)
    // El token NUNCA aparece en data.token — está solo en la cookie
    return data;
}

export async function logout() {
    await api.post('/auth/logout');
    // El servidor sobreescribe la cookie con una fecha expirada
    // El navegador la elimina automáticamente
}

export async function getMe() {
    const { data } = await api.get('/auth/me');
    // El navegador incluye la cookie automáticamente (withCredentials: true)
    // El servidor lee la cookie, verifica el JWT y devuelve { sub, email }
    return data.user;
}
```

### `src/context/AuthContext.tsx` — Estado global de sesión

El **Context** es un contenedor de estado accesible desde cualquier componente
de la app, sin necesidad de pasar props de padre a hijo manualmente.

```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getMe, login as loginService, logout as logoutService } from '../services/auth.service';

interface AuthContextType {
    user: { sub: number; email: string } | null;
    // null = no hay sesión activa
    loading: boolean;
    // true mientras verificamos con el backend si la cookie guardada es válida
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthContextType['user']>(null);
    const [loading, setLoading] = useState(true);
    // Empieza en true porque no sabemos si hay sesión hasta preguntar al backend

    useEffect(() => {
        // Al iniciar la app, preguntamos al backend si la cookie es válida
        // Esto permite que el usuario siga "logueado" aunque recargue la página
        getMe()
            .then(setUser)               // si hay sesión → guarda { sub, email }
            .catch(() => setUser(null))  // si no hay sesión (401) → null
            .finally(() => setLoading(false));
            // loading = false → la app ya sabe si hay sesión o no
            // El ProtectedRoute usa loading para no redirigir prematuramente
    }, []);
    // [] = este efecto corre UNA SOLA VEZ al montar el componente

    const login = async (email: string, password: string) => {
        await loginService(email, password);  // hace POST /api/auth/login
        const me = await getMe();             // obtiene datos del usuario del token
        setUser(me);                          // actualiza el estado global
        // A partir de aquí todos los componentes que usen useAuth() verán user !== null
    };

    const logout = async () => {
        await logoutService();  // hace POST /api/auth/logout (elimina la cookie)
        setUser(null);          // limpia el estado → la app sabe que no hay sesión
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
            {/* Cualquier componente dentro de AuthProvider puede llamar useAuth() */}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
    // Este error ocurre si usas useAuth() en un componente fuera de AuthProvider
    return ctx;
}
```

**En `main.tsx`, envuelve toda la app:**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import App from './App';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            {/* AuthProvider envuelve TODO para que useAuth() funcione en cualquier componente */}
            <App />
        </AuthProvider>
    </StrictMode>
);
```

### `src/components/ProtectedRoute.tsx`

```tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();

    if (loading) return <p>Verificando sesión...</p>;
    // Mientras verificamos con el backend, mostramos un loader
    // Sin esto, el usuario con sesión válida vería un flash del login

    if (!user) return <Navigate to="/login" replace />;
    // No hay sesión → redirige a /login
    // "replace" = no agrega la ruta protegida al historial
    // (si el usuario presiona "atrás" no vuelve a la ruta protegida)

    return <>{children}</>;
    // Hay sesión → renderiza el componente protegido normalmente
}

// Uso en App.tsx:
// <Route path="/dashboard" element={
//     <ProtectedRoute>
//         <Dashboard />
//     </ProtectedRoute>
// } />
```

---

## Endpoints del backend

| Método | URL | ¿Requiere login? | Qué hace |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Crea el usuario con contraseña hasheada |
| `POST` | `/api/auth/login` | No | Valida credenciales y setea la cookie JWT |
| `POST` | `/api/auth/logout` | Sí | Elimina la cookie (cierra sesión) |
| `GET` | `/api/auth/me` | Sí | Devuelve `{ sub, email }` del usuario actual |

---

## Prueba con Thunder Client / Postman

**1. Registrar:**
```json
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{ "name": "Darwin", "email": "darwin@correo.com", "password": "Segura123" }
```
Respuesta: `201` → `{ "success": true, "message": "Usuario registrado correctamente" }`

**2. Login:**
```json
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{ "email": "darwin@correo.com", "password": "Segura123" }
```
Respuesta: `200` + header `Set-Cookie: access_token=eyJhb...; HttpOnly`

**3. Mi perfil (con cookie activa):**
```
GET http://localhost:3000/api/auth/me
```
Respuesta: `{ "success": true, "user": { "sub": 1, "email": "darwin@correo.com" } }`

---

## Errores comunes y soluciones

### ❌ `Access-Control-Allow-Origin: *` bloquea los requests

```
The value of 'Access-Control-Allow-Origin' must not be wildcard '*'
when credentials mode is 'include'
```

**Causa:** `dotenv.config()` se ejecutó después de que `cors()` leyó
`process.env.FRONTEND_URL`. Como era `undefined`, cors usó el wildcard `*`.

**Fix:** Poner `dotenv.config()` como la **primera línea** de `app.ts`:
```typescript
import dotenv from 'dotenv';
dotenv.config();        // ← PRIMERO que todo
import express from 'express';
```

---

### ❌ El servidor no arranca — puerto 3000 en uso

**Síntoma:** `npm run dev` falla. `netstat -ano | findstr 3000` muestra un PID viejo.

**Causa:** Al cambiar `app.ts`, el proceso anterior no se cerró y sigue ocupando el puerto.

**Fix:** Abre **Task Manager** (`Ctrl+Shift+Esc`) → pestaña **Detalles** → busca el PID → **Finalizar tarea**.

O desde una terminal PowerShell propia:
```powershell
Stop-Process -Id <PID> -Force
```
Luego:
```bash
npm run dev
```

---

### ❌ La cookie nunca llega al navegador

| Causa | Fix |
|---|---|
| Falta `withCredentials: true` en axios de React | Agrégalo a la instancia de axios |
| Falta `cookieParser()` en `app.ts` | `app.use(cookieParser())` antes de las rutas |
| En producción: `secure: true` pero sin HTTPS | Configura HTTPS en el servidor |

---

### ❌ `GET /api/auth/me` devuelve 401 al cargar la app

Esto es **completamente normal** cuando el usuario no ha iniciado sesión.
`AuthProvider` captura ese 401 y simplemente pone `user = null`.
No es un bug — es el comportamiento esperado.

---

## Estructura del proyecto

```
src/
├── app.ts                          ← Punto de entrada; dotenv.config() va PRIMERO
├── config/
│   └── db.ts                       ← Pool de conexiones Oracle
├── utils/
│   └── jwt.ts                      ← signToken() y verifyToken()
├── middlewares/
│   ├── auth.middleware.ts           ← protect() — verifica la cookie JWT
│   ├── auth.validator.ts            ← Reglas de validación para register y login
│   ├── user.validator.ts
│   ├── product.validator.ts
│   └── validate.ts                  ← Ejecuta validators y responde 400 si hay errores
├── services/
│   ├── auth.service.ts              ← register() con bcrypt + login() con compare
│   ├── user.service.ts
│   └── product.service.ts
├── controllers/
│   ├── auth.controllers.ts          ← Setea/limpia la cookie HttpOnly
│   ├── user.controllers.ts
│   └── product.controllers.ts
└── routes/
    ├── auth.routes.ts               ← /api/auth/*
    ├── user.routes.ts               ← /api/users/*
    └── product.routes.ts            ← /api/products/*
```

---

## Checklist de seguridad

- [x] Contraseñas hasheadas con `bcrypt` (`SALT_ROUNDS = 12`) — nunca en texto plano
- [x] JWT en cookie `HttpOnly` — JavaScript no puede leerlo ni robarlo
- [x] Cookie con `Secure = true` en producción — solo viaja por HTTPS
- [x] Cookie con `SameSite = Strict` — protege contra ataques CSRF
- [x] `dotenv.config()` primera línea de `app.ts` — CORS funciona correctamente
- [x] CORS con origin específico y `credentials: true`
- [x] Mismo mensaje de error para email y contraseña incorrectos — previene user enumeration
- [x] Bind variables `:param` en SQL — previene SQL Injection
- [x] Validación de entrada con `express-validator` antes de tocar Oracle
- [x] Tokens JWT de corta duración (15 minutos)
- [x] Conexiones Oracle cerradas en bloque `finally` — el pool nunca se agota
- [x] `JWT_SECRET` validado en tiempo de ejecución — falla rápido si falta en `.env`
