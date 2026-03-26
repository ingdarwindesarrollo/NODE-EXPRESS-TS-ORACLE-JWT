# 🔐 Guía: Login Seguro con HttpOnly Cookies + JWT
## 👶 Explicada línea por línea para principiantes

---

## 🧠 ¿QUÉ VAMOS A CONSTRUIR?

### 🧸 La analogía del portero

Imagina que tu app tiene un **portero en la puerta**:

```
Usuario llega → muestra DNI (email + contraseña)
                        │
                        ▼
              ¿Es correcto? → SÍ → portero da una PULSERA (JWT)
                                          │
                                          ▼
                              Para entrar a cualquier sala:
                              solo muestra la pulsera
                              (no vuelves a dar el DNI)
```

👉 Esa "pulsera" es el **JWT** (JSON Web Token)

### 🔐 ¿Dónde guardamos la pulsera?

👉 En una **cookie HttpOnly** — el navegador la guarda solo y la envía en cada petición

🧸 **¿Por qué HttpOnly?**

👉 Porque **ningún código JavaScript puede leerla** — eso bloquea ataques XSS

---

## 🆚 ¿Por qué cookie HttpOnly y no localStorage?

| Pregunta | localStorage | Cookie HttpOnly |
|---|---|---|
| ¿JavaScript puede leerla? | ✅ Sí — peligroso | ❌ No — seguro |
| ¿Vulnerable a XSS? | ✅ Sí | ❌ No |
| ¿Vulnerable a CSRF? | ❌ No | ⚠️ Mitigado con `SameSite=Strict` |
| ¿Se envía automáticamente? | ❌ No, hay que hacerlo manual | ✅ El navegador la incluye siempre |

#### 🧠 ¿Qué es XSS?

👉 **XSS** = Cross-Site Scripting

🧸 Un atacante inyecta código JavaScript malicioso que intenta robar el token de `localStorage`

✅ Con `HttpOnly`, aunque inyecte código, **no puede leer la cookie**

---

## 🔄 Flujo completo — paso a paso

### 📝 REGISTRO

```
React  →  POST /api/auth/register  { name, email, password }
                    │
                    ▼
         bcrypt convierte "MiPass123" → "$2b$12$...hash..."
                    │
                    ▼
         Oracle: INSERT INTO users (name, email, password_hash)
                    │
                    ▼
         Responde: { success: true, message: "Usuario registrado" }
```

### 🔑 LOGIN

```
React  →  POST /api/auth/login  { email, password }
                    │
                    ▼
         Backend busca usuario por email en Oracle
                    │
                    ▼
         bcrypt.compare(lo que escribió, hash guardado)
                    │
                  ¿Igual?
                    │
                   SÍ
                    │
                    ▼
         Crea JWT: { sub: 5, email: "user@x.com" }
                    │
                    ▼
         Set-Cookie: access_token=eyJhb...; HttpOnly; Secure; SameSite=Strict
         (el navegador guarda la cookie automáticamente)
```

### 🛡️ RUTAS PROTEGIDAS (ej: `/api/auth/me`)

```
React  →  GET /api/auth/me
(el navegador envía la cookie automáticamente)
                    │
                    ▼
         Middleware "protect" lee: req.cookies.access_token
                    │
                    ▼
         Verifica firma del JWT y que no haya expirado
                    │
                    ▼
         req.user = { sub: 5, email: "user@x.com" }
                    │
                    ▼
         Responde: { success: true, user: { sub: 5, email: "..." } }
```

### 🚪 LOGOUT

```
React  →  POST /api/auth/logout
                    │
                    ▼
         Backend sobreescribe la cookie con fecha expirada
                    │
                    ▼
         El navegador la elimina automáticamente
```

---

## 📦 PASO 0 — Instalación de paquetes

```bash
# Paquetes que usa el servidor en producción
npm install jsonwebtoken cookie-parser bcrypt

# Definiciones de tipos para TypeScript
npm install --save-dev @types/jsonwebtoken @types/cookie-parser @types/bcrypt
```

### 🔍 ¿Para qué sirve cada paquete?

| Paquete | ¿Para qué sirve? |
|---|---|
| `jsonwebtoken` | Crear y verificar tokens JWT |
| `cookie-parser` | Leer las cookies que llegan en los requests (`req.cookies`) |
| `bcrypt` | Convertir contraseñas en hashes seguros y compararlas |
| `dotenv` | Leer variables secretas del archivo `.env` |

---

## 🔒 PASO 0.1 — El archivo `.env`

### 🧠 ¿Qué es `.env`?

👉 Un archivo que guarda **datos secretos** que NO deben ir en el código fuente

#### ⚠️ IMPORTANTE

> Si subes `.env` a GitHub, cualquiera podría ver tus credenciales
>
> Agrega `.env` a tu `.gitignore` para que **nunca** se suba

```env
# ── Base de datos Oracle ──────────────────────────────
DB_USER=system
DB_PASS=tu_contraseña_oracle
DB_CONN=localhost/XEPDB1

# ── JWT ───────────────────────────────────────────────
# Genera un secreto aleatorio con:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=pega_aqui_el_secreto_generado_de_128_caracteres
JWT_EXPIRES_IN=15m

# ── Entorno ───────────────────────────────────────────
NODE_ENV=development      # cámbialo a "production" cuando subas al servidor

# ── URL del frontend ──────────────────────────────────
FRONTEND_URL=http://localhost:5173
```

### 🧸 ¿Por qué `JWT_EXPIRES_IN=15m`?

👉 Si alguien roba el token y dura para siempre → el atacante tiene acceso **indefinido**

✅ Con 15 minutos → el daño es muy limitado

---

## 🗄️ PASO 1 — Tabla Oracle: columna `password_hash`

### 🧠 ¿Por qué NO guardamos la contraseña directamente?

👉 Porque si alguien roba tu base de datos → **no debe poder leer las contraseñas**

#### 🧸 ¿Cómo funciona el hash?

```
"MiPass123"  →  bcrypt  →  "$2b$12$N9qo8uLOickgx2ZMRZpBhe..."
  (texto plano)                     (hash — irreversible)
```

👉 Guardamos solo el hash — cuando el usuario inicia sesión, transformamos lo que escribe y **comparamos los dos hashes**

❌ Nunca guardamos ni comparamos la contraseña en texto plano

---

### El código SQL

```sql
-- Si la tabla ya existe, solo agrega la columna nueva:
ALTER TABLE users ADD (password_hash VARCHAR2(60));

-- Si estás creando la tabla desde cero:
CREATE TABLE users (
    id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          VARCHAR2(100)  NOT NULL,
    email         VARCHAR2(150)  NOT NULL UNIQUE,
    password_hash VARCHAR2(60)   NOT NULL
);
```

### 🔍 Explicación de cada línea

| Parte | ¿Qué hace? |
|---|---|
| `GENERATED ALWAYS AS IDENTITY` | Oracle genera el ID automáticamente (1, 2, 3...) |
| `NOT NULL` | El campo es obligatorio — no puede quedar vacío |
| `UNIQUE` | No pueden existir dos usuarios con el mismo email |
| `VARCHAR2(60)` | bcrypt **siempre** produce exactamente 60 caracteres |

#### 🧸 ¿Por qué exactamente 60?

👉 bcrypt siempre produce un hash de ese largo, sin importar qué tan larga sea la contraseña original

---

## PASO 2 — Utilidad JWT (`src/utils/jwt.ts`)

Este archivo es el "fabricante de pulseras". Tiene dos funciones:
`signToken` (crea el token) y `verifyToken` (comprueba si es válido).

---

### 🧠 ¿QUÉ ES "PAYLOAD"?

👉 **Payload = los datos que van dentro del token**

#### 🧸 Traducción simple

👉 Es el "contenido" del token

#### 🔐 Ejemplo real

```json
{
  "sub": 1,
  "email": "admin@test.com"
}
```

👉 Esto es lo que viaja dentro del JWT

---

### 🧱 ESTRUCTURA DE UN JWT

Un token tiene 3 partes separadas por puntos:

```
HEADER.PAYLOAD.FIRMA
```

#### 🧸 Ejemplo real

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.abc123
```

#### 🔍 ¿Qué es cada parte?

| Parte | ¿Qué contiene? |
|---|---|
| **1. Header** | Tipo de algoritmo (`HS256`) |
| **2. Payload** | 🔥 Tus datos (`sub`, `email`, `iat`, `exp`) |
| **3. Firma** | Seguridad — evita que alguien manipule el token |

#### ⚠️ IMPORTANTE

> 👉 El payload **NO está encriptado** — está en base64, cualquiera puede leerlo
>
> ❌ **NUNCA pongas** contraseñas ni datos sensibles en el payload

---

### El código completo

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

    if (!SECRET) throw new Error('JWT_SECRET no está definido en .env');

    return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
    if (!SECRET) throw new Error('JWT_SECRET no está definido en .env');

    return jwt.verify(token, SECRET) as unknown as JwtPayload;
}
```

---

### 🔍 `signToken` — explicada línea por línea

#### La firma de la función

```typescript
export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
```

👉 Defines una función que:
- recibe `payload` (los datos del usuario)
- devuelve un `string` (el token JWT)

#### 🔥 La parte importante: `Omit<JwtPayload, 'iat' | 'exp'>`

🧠 **Traducción:** "usa JwtPayload pero **SIN** `iat` y `exp`"

🧸 **¿Por qué?** Porque `jwt.sign` los agrega solo — no debes pasarlos tú

#### 🕒 ¿Qué son `iat` y `exp`?

| Campo | Nombre completo | ¿Qué significa? |
|---|---|---|
| `iat` | *Issued At* | Cuándo **nació** el token (timestamp Unix) |
| `exp` | *Expiration* | Cuándo **muere** el token (timestamp Unix) |

#### 🧸 Así quedan dentro del token automáticamente

```json
{
  "sub": 1,
  "email": "darwin@correo.com",
  "iat": 1710000000,
  "exp": 1710003600
}
```

---

#### 🔐 Validación del SECRET

```typescript
if (!SECRET) throw new Error('JWT_SECRET no está definido en .env');
```

🧠 **¿Qué hace?** Verifica que exista el secreto antes de usarlo

🧸 **¿Por qué?** Sin secreto, cualquiera podría falsificar tokens

#### 🔑 Ejemplo en `.env`

```env
JWT_SECRET=mi_super_secreto_de_128_caracteres
```

---

#### 🚀 Creación del token

```typescript
return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions);
```

🧠 **¿Qué hace?** Toma tus datos + el secreto y produce el token firmado

#### 🔍 Partes de `jwt.sign`

| Parámetro | ¿Qué es? |
|---|---|
| `payload` | Los datos del usuario (`sub`, `email`) |
| `SECRET` | La clave secreta para firmar |
| `expiresIn` | El tiempo de vida del token |

#### 🧸 Ejemplo de uso

```typescript
jwt.sign(
  { sub: 1, email: "darwin@correo.com" },
  'mi_secreto',
  { expiresIn: '15m' }
);
```

#### 🔐 Resultado

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.abc123
─── header ──────────  ─ payload ─   firma
```

---

#### 🎯 RESUMEN TIPO BEBÉ 👶

| Concepto | ¿Qué es? |
|---|---|
| `payload` | Lo que guarda el token (datos del usuario) |
| `iat` | Cuándo nació el token |
| `exp` | Cuándo muere el token |
| `SECRET` | La contraseña que firma el token |
| `jwt.sign` | La función que crea el token |

#### ⚠️ Errores comunes

| ❌ Error | ✅ Solución |
|---|---|
| Guardar la contraseña en el payload | Solo guarda `sub` y `email` |
| No usar expiración | Siempre usa `expiresIn` |
| Usar un secreto débil | Genera uno con `crypto.randomBytes(64)` |

---

### 🔍 `verifyToken` — explicada línea por línea

```typescript
export function verifyToken(token: string): JwtPayload {
    if (!SECRET) throw new Error('JWT_SECRET no está definido en .env');

    return jwt.verify(token, SECRET) as unknown as JwtPayload;
}
```

`jwt.verify` comprueba dos cosas a la vez:

1. ✅ La **firma es válida** — nadie alteró el token
2. ✅ El token **no ha expirado**

Si alguna falla → lanza una excepción automáticamente que el middleware captura.

> `as unknown as JwtPayload` es necesario por un conflicto de tipos de TypeScript entre la librería y nuestra interfaz.

---

## 🛡️ PASO 3 — Middleware de protección (`src/middlewares/auth.middleware.ts`)

### 🧠 ¿Qué es un middleware?

👉 Una función que se ejecuta **antes** del controlador

🧸 Actúa como el **portero de una sala exclusiva**: revisa la "pulsera" (cookie) y solo deja pasar si es válida

---

### 🔍 Flujo visual del middleware `protect`

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

### El código completo

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';

export interface AuthRequest extends Request {
    user?: JwtPayload;
}

export function protect(req: AuthRequest, res: Response, next: NextFunction): void {
    const token: string | undefined = req.cookies?.access_token;

    if (!token) {
        res.status(401).json({ success: false, message: 'No autorizado: token no encontrado' });
        return;
    }

    try {
        req.user = verifyToken(token);
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Token inválido o expirado' });
    }
}
```

---

### 🔍 Explicación línea por línea

#### La interfaz `AuthRequest`

```typescript
export interface AuthRequest extends Request {
    user?: JwtPayload;
}
```

🧠 **¿Qué hace?** Extiende el tipo `Request` de Express para agregar la propiedad `user`

🧸 **¿Por qué?** Sin esta extensión, TypeScript no sabría que `req.user` existe y daría error

---

#### Leer la cookie

```typescript
const token: string | undefined = req.cookies?.access_token;
```

🔍 **Partes:**

| Parte | ¿Qué es? |
|---|---|
| `req.cookies` | Objeto con todas las cookies que llegaron en la petición |
| `.access_token` | El nombre de nuestra cookie (el mismo que usamos al crearla) |
| `?.` | Evita un error si `req.cookies` es `undefined` |

---

#### Verificar que existe el token

```typescript
if (!token) {
    res.status(401).json({ ... });
    return;
}
```

🧠 **¿Qué hace?** Si no hay cookie → el usuario no está logueado → rechaza la petición

#### 🧸 ¿Por qué `return` después de `res.status(401)`?

👉 Sin `return`, TypeScript reporta error porque `next()` también podría llamarse

| Código HTTP | Significado |
|---|---|
| `401` | No autenticado (no tiene token) |
| `403` | Autenticado pero sin permiso |

---

#### Verificar el token

```typescript
try {
    req.user = verifyToken(token);
    next();
} catch {
    res.status(401).json({ success: false, message: 'Token inválido o expirado' });
}
```

🧠 **Si el token es válido:** guarda datos en `req.user` y llama `next()`

🧠 **Si el token es inválido:** `verifyToken` lanza una excepción que el `catch` atrapa

#### 🔥 ¿Cuándo lanza excepción `verifyToken`?

| Caso | Error |
|---|---|
| El token fue alterado | `JsonWebTokenError` |
| El token expiró | `TokenExpiredError` |

---

## ⚙️ PASO 4 — Servicio de autenticación (`src/services/auth.service.ts`)

### 🧠 ¿Qué es un servicio?

👉 Contiene la **lógica de negocio**: hashear contraseñas, buscar en Oracle, generar tokens

🧸 El controlador recibe el request → llama al servicio → el servicio hace el trabajo real

---

### 🔢 ¿Qué es `SALT_ROUNDS`?

```typescript
const SALT_ROUNDS = 12;
```

👉 Cuántas veces bcrypt procesa la contraseña internamente

| Valor | Velocidad | Seguridad |
|---|---|---|
| Bajo (ej: 4) | Muy rápido | Débil |
| 12 ✅ | ~300ms | Bueno |
| Alto (ej: 20) | Muy lento | Excesivo |

🧸 **¿Por qué 300ms está bien?**
- Para el usuario → apenas lo nota
- Para un atacante probando millones de contraseñas → 300ms por intento = **impracticable**

---

### 📝 Función `register` — explicada

```typescript
export async function register(dto: RegisterDto): Promise<void> {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const conn = await getConnection();

    try {
        await conn.execute(
            `INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :passwordHash)`,
            { name: dto.name, email: dto.email, passwordHash },
            { autoCommit: true }
        );
    } finally {
        await conn.close();
    }
}
```

#### 🔍 Línea por línea

**`bcrypt.hash(dto.password, SALT_ROUNDS)`**

```
"MiPass123"  →  bcrypt.hash(...)  →  "$2b$12$N9qo8uLOickgx2ZMRZpBhe..."
```

👉 Ese hash de 60 caracteres es lo que guardamos en Oracle — **imposible de revertir**

---

**Los `:parametros` (bind variables)**

```typescript
`INSERT INTO users VALUES (:name, :email, :passwordHash)`
```

🔐 **¿Por qué `:name` y no `${name}`?**

| ❌ Peligroso | ✅ Seguro |
|---|---|
| `` `INSERT INTO users VALUES ('${name}')` `` | `` `INSERT INTO users VALUES (:name)` `` |
| SQL Injection posible | Oracle sustituye los valores de forma segura |

---

**`autoCommit: true`**

👉 Confirma la transacción automáticamente — equivale a hacer `COMMIT` en Oracle

---

**El bloque `finally`**

```typescript
} finally {
    await conn.close();
}
```

🧠 **¿Qué hace?** Se ejecuta SIEMPRE — con éxito o con error

🔥 **¿Por qué es crítico?** Si nunca cerramos conexiones → el pool se agota → el servidor deja de responder

---

### 🔑 Función `login` — explicada

```typescript
export async function login(dto: LoginDto): Promise<string> {
    const conn = await getConnection();
    let row: [number, string, string] | undefined;

    try {
        const result = await conn.execute<[number, string, string]>(
            `SELECT id, email, password_hash FROM users WHERE email = :email`,
            { email: dto.email },
            { outFormat: OracleDB.OUT_FORMAT_ARRAY }
        );
        row = result.rows?.[0];
    } finally {
        await conn.close();
    }

    if (!row) {
        throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
    }

    const [id, email, hash] = row;

    const valid = await bcrypt.compare(dto.password, hash);

    if (!valid) {
        throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
    }

    return signToken({ sub: id, email });
}
```

#### 🔍 Línea por línea

**`OUT_FORMAT_ARRAY`**

```typescript
{ outFormat: OracleDB.OUT_FORMAT_ARRAY }
```

👉 Devuelve la fila como array: `[1, "darwin@...", "$2b$12$..."]`

🧸 En vez de objeto: `{ ID: 1, EMAIL: "darwin@..." }` — más fácil de desestructurar

---

**`result.rows?.[0]`**

👉 Primera (y única) fila, o `undefined` si no existe el email

---

**Mensaje de error genérico**

```typescript
throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
```

🧠 **¿Por qué el mismo mensaje para email y contraseña incorrectos?**

| ❌ Mensaje específico | ✅ Mensaje genérico |
|---|---|
| "Ese email no existe" | "Credenciales inválidas" |
| Atacante descubre qué emails están registrados | Atacante no sabe qué falló |

> 👉 Esto previene el ataque de **user enumeration** (descubrir usuarios válidos)

---

**`bcrypt.compare`**

```typescript
const valid = await bcrypt.compare(dto.password, hash);
```

```
"MiPass123"  +  "$2b$12$N9qo8..."  →  bcrypt.compare  →  true / false
 (lo que escribió)  (hash guardado)
```

🧸 bcrypt extrae el "salt" del hash guardado, rehashea la contraseña enviada y compara — de forma **internamente segura** (timing-safe)

---

**`signToken({ sub: id, email })`**

👉 Crea el JWT con el ID y email del usuario

👉 Este token irá en la cookie HttpOnly que setea el controlador

---

## ✅ PASO 5 — Validadores (`src/middlewares/auth.validator.ts`)

### 🧠 ¿Qué hace un validador?

👉 Revisa que los datos del formulario sean correctos **antes** de que lleguen al servicio

#### 🧸 ¿Por qué validar antes?

```
Request llega
      │
      ▼
  Validador
      │
  ¿Hay errores?
      │
    SÍ ──► responde 400 directamente ──► FIN (no toca Oracle)
      │
     NO
      │
      ▼
  Servicio → Oracle
```

👉 Si hay error → responde con 400 y **no se ejecuta nada más** (no hay consultas a Oracle)

---

### El código completo

```typescript
import { body, ValidationChain } from 'express-validator';

export const registerValidator: ValidationChain[] = [
    body('name')
        .notEmpty().withMessage('El nombre es requerido')
        .isLength({ min: 3 }).withMessage('Mínimo 3 caracteres'),

    body('email')
        .isEmail().withMessage('Email inválido')
        .normalizeEmail(),

    body('password')
        .isLength({ min: 8 }).withMessage('Mínimo 8 caracteres')
        .matches(/[A-Z]/).withMessage('Debe contener al menos una mayúscula')
        .matches(/[0-9]/).withMessage('Debe contener al menos un número'),
];

export const loginValidator: ValidationChain[] = [
    body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
    body('password').notEmpty().withMessage('La contraseña es requerida'),
];
```

---

### 🔍 Explicación de cada regla

#### Para el registro (`registerValidator`)

| Campo | Regla | ¿Qué rechaza? |
|---|---|---|
| `name` | `notEmpty()` | `""`, `null`, `undefined`, `"   "` (solo espacios) |
| `name` | `isLength({ min: 3 })` | Nombres de 1 o 2 caracteres |
| `email` | `isEmail()` | Cualquier cosa que no sea `usuario@dominio.com` |
| `email` | `normalizeEmail()` | Convierte a minúsculas: `ANA@GMAIL.COM` → `ana@gmail.com` |
| `password` | `isLength({ min: 8 })` | Contraseñas muy cortas |
| `password` | `matches(/[A-Z]/)` | Contraseñas sin ninguna mayúscula |
| `password` | `matches(/[0-9]/)` | Contraseñas sin ningún número |

#### 🧸 ¿Por qué `normalizeEmail()`?

👉 Evita que el mismo email se registre como `Ana@gmail.com` y `ana@gmail.com` — que son el mismo

#### Para el login (`loginValidator`)

👉 Solo valida formato básico — **NO** las reglas de complejidad

🧸 Las reglas estrictas (mayúsculas, números) son solo para el registro, no para verificar credenciales

---

## 🎮 PASO 6 — Controlador (`src/controllers/auth.controllers.ts`)

### 🧠 ¿Qué hace el controlador?

👉 Decide qué cookie setear, cuánto tiempo dura y con qué atributos de seguridad

🧸 El controlador es el "jefe" — recibe el request, llama al servicio y envía la respuesta

---

### 🔐 Las opciones de seguridad de la cookie

```typescript
const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict' as const,
    maxAge: 15 * 60 * 1000,
    path: '/',
};
```

#### 🔍 ¿Qué protege cada opción?

| Opción | Valor | ¿Qué protege? |
|---|---|---|
| `httpOnly: true` | siempre | JavaScript NO puede leer la cookie — bloquea XSS |
| `secure: isProd` | `true` en producción | Solo viaja por HTTPS — en localhost es `false` |
| `sameSite: 'strict'` | siempre | No se envía desde otros dominios — bloquea CSRF |
| `maxAge: 15 * 60 * 1000` | 900.000 ms | El navegador elimina la cookie después de 15 minutos |
| `path: '/'` | siempre | La cookie se envía en TODAS las rutas del dominio |

#### 🧸 ¿Qué es CSRF?

👉 Un atacante en `maliweb.com` intenta hacer un fetch a `tuapp.com`

✅ Con `SameSite=Strict` → el navegador **no incluye la cookie** → el ataque falla

---

### El código completo

```typescript
import { Request, Response, NextFunction } from 'express';
import * as service from '../services/auth.service';
import { AuthRequest } from '../middlewares/auth.middleware';

const COOKIE_NAME = 'access_token';
const isProd = process.env.NODE_ENV === 'production';

const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict' as const,
    maxAge: 15 * 60 * 1000,
    path: '/',
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await service.register(req.body);
        res.status(201).json({ success: true, message: 'Usuario registrado correctamente' });
    } catch (err) {
        next(err);
    }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token = await service.login(req.body);
        res.cookie(COOKIE_NAME, token, cookieOptions);
        res.json({ success: true, message: 'Login exitoso' });
    } catch (err) {
        next(err);
    }
};

export const logout = (_req: Request, res: Response): void => {
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        path: '/',
    });
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
};

export const me = (req: AuthRequest, res: Response): void => {
    res.json({ success: true, user: req.user });
};
```

---

### 🔍 Explicación de cada función

#### `register` — crear usuario

```typescript
res.status(201).json({ ... });
```

| Código | Significado |
|---|---|
| `200` | Todo bien (respuesta genérica) |
| `201` | Se **creó** un nuevo recurso ← correcto para registro |

🧸 Si Oracle devuelve `ORA-00001` (email duplicado) → `next(err)` lo pasa al `errorHandler`

---

#### `login` — iniciar sesión

```typescript
res.cookie(COOKIE_NAME, token, cookieOptions);
```

👉 Agrega el header `Set-Cookie` a la respuesta HTTP:

```
Set-Cookie: access_token=eyJhb...; HttpOnly; SameSite=Strict; Max-Age=900; Path=/
```

👉 El navegador recibe este header y **guarda la cookie automáticamente**

#### ⚠️ IMPORTANTE

> El token **NO va en el body** de la respuesta
>
> Solo está en la cookie — que JavaScript no puede leer

---

#### `logout` — cerrar sesión

```typescript
res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/' });
```

#### ⚠️ Las opciones deben coincidir EXACTAMENTE con las del login

> Si difieren aunque sea en una propiedad → el navegador **no eliminará la cookie**

🧸 `clearCookie` envía:
```
Set-Cookie: access_token=; Max-Age=0; Expires=Thu, 01 Jan 1970...
```
El navegador interpreta "expirado en el pasado" como "eliminar esta cookie"

---

#### `me` — obtener datos del usuario actual

```typescript
export const me = (req: AuthRequest, res: Response): void => {
    res.json({ success: true, user: req.user });
};
```

👉 Este controlador **SOLO llega aquí** si el middleware `protect` lo permitió

👉 `req.user` ya contiene los datos del token verificado

🧸 Ejemplo de respuesta:
```json
{ "success": true, "user": { "sub": 5, "email": "darwin@correo.com" } }
```

---

## 🗺️ PASO 7 — Rutas (`src/routes/auth.routes.ts`)

### 🧠 ¿Qué hacen las rutas?

👉 Conectan las **URLs** con sus **middlewares** y **controladores**

---

### El código completo

```typescript
import { Router } from 'express';
import * as c from '../controllers/auth.controllers';
import validate from '../middlewares/validate';
import { registerValidator, loginValidator } from '../middlewares/auth.validator';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

router.post('/register', registerValidator, validate, c.register);
router.post('/login',    loginValidator,    validate, c.login);
router.post('/logout',   protect,                     c.logout);
router.get('/me',        protect,                     c.me);

export default router;
```

---

### 🔍 ¿Cómo funciona el orden de middlewares?

Express ejecuta los middlewares **en orden**, de izquierda a derecha:

#### `POST /register`

```
registerValidator  →  validate  →  c.register
       │                  │              │
  define reglas     ¿hay errores?    crea usuario
                         │
                      SÍ → responde 400 y PARA
                      NO → siguiente
```

#### `POST /login`

```
loginValidator  →  validate  →  c.login
```

#### `POST /logout` y `GET /me`

```
protect  →  c.logout / c.me
   │
¿cookie válida?
   │
  NO → 401, PARA
   │
  SÍ → siguiente
```

#### 🧸 ¿Por qué `protect` antes de `logout`?

👉 No tiene sentido hacer logout sin estar logueado

---

## 🚀 PASO 8 — `app.ts` — Punto de entrada del servidor

### 🧠 ¿Qué es `app.ts`?

👉 Es el archivo principal del servidor — aquí se registran todos los middlewares y rutas

#### ⚠️ REGLA DE ORO

> `dotenv.config()` debe ser la **PRIMERA LÍNEA** — antes de todo

---

### El código completo

```typescript
import dotenv from 'dotenv';
dotenv.config();    // ← PRIMERO QUE TODO

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
    credentials: true,
}));

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/products', productRoutes);

initDB();

app.listen(3000, () => console.log('Servidor en http://localhost:3000'));

app.use(errorHandler);   // ← SIEMPRE AL FINAL
```

---

### 🔍 Explicación de cada parte

#### `dotenv.config()` — primera línea obligatoria

🔥 **¿Qué pasa si no va primero?**

```
cors() lee process.env.FRONTEND_URL  →  undefined
cors interpreta undefined como "todos los orígenes"
cors envía: Access-Control-Allow-Origin: *
El navegador BLOQUEA las cookies → error CORS
```

✅ Con `dotenv.config()` primero → `FRONTEND_URL` ya está cargado cuando `cors()` lo lee

---

#### `cors({ origin, credentials: true })`

| Opción | ¿Qué hace? |
|---|---|
| `origin` | Permite SOLO las peticiones de esa URL — el resto son bloqueadas |
| `credentials: true` | **OBLIGATORIO** para que el navegador acepte y envíe cookies cross-origin |

🧸 **¿Qué es cross-origin?** El backend (`:3000`) y el frontend (`:5173`) son orígenes distintos

#### ⚠️ Sin `credentials: true`

👉 El navegador descarta la cookie del `Set-Cookie` — el login nunca funciona

---

#### `helmet()`

👉 Agrega automáticamente headers de seguridad HTTP:

| Header | ¿Qué previene? |
|---|---|
| `X-Frame-Options: DENY` | Clickjacking |
| `X-Content-Type-Options: nosniff` | MIME sniffing |
| `Content-Security-Policy` | Restringe recursos que puede cargar la página |

---

#### `express.json()`

👉 Permite que Express lea el body de los requests como JSON

#### ⚠️ Sin esto

👉 `req.body` sería `undefined` en todos los controladores

---

#### `cookieParser()`

👉 Habilita `req.cookies` para leer cookies que llegan en los requests

#### ⚠️ Sin esto

👉 `req.cookies.access_token` sería `undefined` → todos aparecerían como no autenticados

---

#### `app.use(errorHandler)` — siempre al final

🧸 **¿Por qué al final?** Express sabe que es un manejador de errores porque tiene 4 parámetros: `(err, req, res, next)`

👉 Si va antes de las rutas → los errores de esas rutas **no llegarían a él**

---

## 🔒 PASO 9 — Proteger rutas existentes

### 🧠 ¿Cómo protejo una ruta?

👉 Agrega `protect` como **primer middleware** en la ruta que quieras proteger

```typescript
// src/routes/product.routes.ts
import { protect } from '../middlewares/auth.middleware';

router.get('/',       c.getAll);          // 🌐 Pública — no requiere login
router.post('/',      protect, c.create); // 🔒 Privada — requiere login
router.put('/:id',    protect, c.update); // 🔒 Privada
router.delete('/:id', protect, c.remove); // 🔒 Privada
```

### 🔍 ¿Qué pasa cuando `protect` falla?

```
POST /api/products  (sin cookie)
          │
          ▼
       protect
          │
  ¿cookie válida? → NO
          │
          ▼
    401 "No autorizado"
          │
          ▼
    c.create NUNCA se ejecuta
```

| Ruta | ¿Requiere login? | ¿Por qué? |
|---|---|---|
| `GET /` | ❌ No | Cualquiera puede ver la lista de productos |
| `POST /` | ✅ Sí | Solo usuarios logueados pueden crear |
| `PUT /:id` | ✅ Sí | Solo usuarios logueados pueden editar |
| `DELETE /:id` | ✅ Sí | Solo usuarios logueados pueden eliminar |

---

## ⚛️ PASO 10 — Integración con React

### 🔧 `src/lib/axios.ts` — Configuración global

```typescript
import axios from 'axios';

export const api = axios.create({
    baseURL: 'http://localhost:3000/api',
    withCredentials: true,
});
```

#### 🔍 Explicación

| Opción | ¿Qué hace? |
|---|---|
| `baseURL` | Prefijo de todas las URLs: `api.get('/auth/me')` llama a `localhost:3000/api/auth/me` |
| `withCredentials: true` | **OBLIGATORIO** — le dice al navegador que incluya las cookies en los requests |

#### ⚠️ Sin `withCredentials: true`

👉 La cookie del login **nunca se enviará** en requests posteriores

👉 El middleware `protect` siempre verá `req.cookies.access_token` como `undefined`

---

### 📡 `src/services/auth.service.ts` (React)

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
    // El token NUNCA aparece en data — está solo en la cookie
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

---

### 🌐 `src/context/AuthContext.tsx` — Estado global de sesión

#### 🧠 ¿Qué es el Context?

👉 Un contenedor de estado accesible desde **cualquier componente** de la app

🧸 Sin Context → tendrías que pasar `user` de padre a hijo manualmente (prop drilling)

```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getMe, login as loginService, logout as logoutService } from '../services/auth.service';

interface AuthContextType {
    user: { sub: number; email: string } | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthContextType['user']>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getMe()
            .then(setUser)
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, []);

    const login = async (email: string, password: string) => {
        await loginService(email, password);
        const me = await getMe();
        setUser(me);
    };

    const logout = async () => {
        await logoutService();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
    return ctx;
}
```

#### 🔍 Explicación de las partes clave

**`user: null`** → no hay sesión activa

**`loading: true`** → empieza en `true` porque no sabemos si hay sesión hasta preguntar al backend

**El `useEffect`:**

```
App inicia
    │
    ▼
getMe() → GET /api/auth/me
    │
¿Cookie válida?
    │
  SÍ → setUser({ sub, email })   → loading = false
    │
  NO (401) → setUser(null)       → loading = false
```

👉 Esto permite que el usuario siga "logueado" aunque **recargue la página**

---

#### 🔧 En `main.tsx` — envuelve toda la app

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import App from './App';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AuthProvider>
            <App />
        </AuthProvider>
    </StrictMode>
);
```

👉 `AuthProvider` envuelve TODO para que `useAuth()` funcione en cualquier componente

---

### 🛡️ `src/components/ProtectedRoute.tsx`

```tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();

    if (loading) return <p>Verificando sesión...</p>;
    if (!user)   return <Navigate to="/login" replace />;
    return <>{children}</>;
}
```

#### 🔍 ¿Por qué necesitamos `loading`?

```
App inicia → loading = true → getMe() aún no terminó
                │
                ▼
    Sin "loading": el usuario con sesión válida vería
    un FLASH del login antes de ser redirigido al dashboard
                │
                ▼
    Con "loading": mostramos "Verificando sesión..."
    hasta que getMe() termine
```

#### 🧸 El `replace` en `Navigate`

👉 No agrega la ruta protegida al historial del navegador

👉 Si el usuario presiona "atrás" → **no vuelve** a la ruta protegida

#### 🔧 Uso en `App.tsx`

```tsx
<Route path="/dashboard" element={
    <ProtectedRoute>
        <Dashboard />
    </ProtectedRoute>
} />
```

---

## 🌐 Endpoints del backend

| Método | URL | 🔒 Login? | ¿Qué hace? |
|---|---|---|---|
| `POST` | `/api/auth/register` | ❌ No | Crea el usuario con contraseña hasheada |
| `POST` | `/api/auth/login` | ❌ No | Valida credenciales y setea la cookie JWT |
| `POST` | `/api/auth/logout` | ✅ Sí | Elimina la cookie (cierra sesión) |
| `GET` | `/api/auth/me` | ✅ Sí | Devuelve `{ sub, email }` del usuario actual |

---

## 🧪 Prueba con Thunder Client / Postman

### 1️⃣ Registrar

```json
POST http://localhost:3000/api/auth/register
Content-Type: application/json

{ "name": "Darwin", "email": "darwin@correo.com", "password": "Segura123" }
```

✅ Respuesta esperada: `201`
```json
{ "success": true, "message": "Usuario registrado correctamente" }
```

---

### 2️⃣ Login

```json
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{ "email": "darwin@correo.com", "password": "Segura123" }
```

✅ Respuesta esperada: `200` + header:
```
Set-Cookie: access_token=eyJhb...; HttpOnly; SameSite=Strict
```

---

### 3️⃣ Mi perfil (con cookie activa)

```
GET http://localhost:3000/api/auth/me
```

✅ Respuesta esperada:
```json
{ "success": true, "user": { "sub": 1, "email": "darwin@correo.com" } }
```

---

## 🐛 Errores comunes y soluciones

### ❌ Error: `Access-Control-Allow-Origin: *` bloquea los requests

```
The value of 'Access-Control-Allow-Origin' must not be wildcard '*'
when credentials mode is 'include'
```

#### 🧠 ¿Por qué ocurre?

👉 `dotenv.config()` se ejecutó **después** de que `cors()` leyó `process.env.FRONTEND_URL`

👉 Como era `undefined`, cors usó el wildcard `*`

👉 El navegador bloquea cookies cuando el origen es `*`

#### ✅ Fix

```typescript
import dotenv from 'dotenv';
dotenv.config();        // ← PRIMERO que todo
import express from 'express';
```

---

### ❌ Error: El servidor no arranca — puerto 3000 en uso

**Síntoma:** `npm run dev` falla

```
Error: listen EADDRINUSE: address already in use :::3000
```

#### 🧠 ¿Por qué ocurre?

👉 Al cambiar `app.ts`, el proceso anterior no se cerró y sigue ocupando el puerto

#### ✅ Fix en PowerShell

```powershell
# 1. Ver qué proceso usa el puerto 3000
netstat -ano | findstr 3000

# 2. Matar el proceso por su PID
Stop-Process -Id <PID> -Force

# 3. Reiniciar el servidor
npm run dev
```

🧸 O abre **Task Manager** (`Ctrl+Shift+Esc`) → pestaña **Detalles** → busca el PID → **Finalizar tarea**

---

### ❌ Error: La cookie nunca llega al navegador

| ❌ Causa | ✅ Fix |
|---|---|
| Falta `withCredentials: true` en axios (React) | Agrégalo a la instancia de axios |
| Falta `app.use(cookieParser())` en `app.ts` | Agrégalo antes de las rutas |
| En producción: `secure: true` pero sin HTTPS | Configura HTTPS en el servidor |
| `dotenv.config()` no está primera | Muévelo a la primera línea de `app.ts` |

---

### ❌ Error: `GET /api/auth/me` devuelve 401 al cargar la app

#### 🧠 ¿Es un bug?

👉 **NO** — es completamente normal cuando el usuario no ha iniciado sesión

✅ `AuthProvider` captura ese 401 y simplemente pone `user = null`

👉 Es el **comportamiento esperado**

---

## 📁 Estructura del proyecto

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

## 🔐 Checklist de seguridad

| ✅ | Medida | ¿Qué protege? |
|---|---|---|
| ✅ | `bcrypt` con `SALT_ROUNDS = 12` | Contraseñas nunca en texto plano |
| ✅ | JWT en cookie `HttpOnly` | JavaScript no puede robar el token — bloquea XSS |
| ✅ | `Secure = true` en producción | El token solo viaja por HTTPS |
| ✅ | `SameSite = Strict` | Protege contra ataques CSRF |
| ✅ | `dotenv.config()` primera línea | CORS funciona correctamente |
| ✅ | CORS con origin específico + `credentials: true` | Solo acepta el frontend conocido |
| ✅ | Mismo mensaje para email y contraseña incorrectos | Previene user enumeration |
| ✅ | Bind variables `:param` en SQL | Previene SQL Injection |
| ✅ | Validación con `express-validator` antes de Oracle | Filtra datos maliciosos |
| ✅ | Token de corta duración (15 minutos) | Limita el daño si un token es robado |
| ✅ | Conexiones Oracle cerradas en `finally` | El pool nunca se agota |
| ✅ | `JWT_SECRET` validado en tiempo de ejecución | Falla rápido si falta en `.env` |

---

## 🎯 Resumen tipo bebé 👶

| Concepto | ¿Qué es? |
|---|---|
| JWT | La "pulsera" del usuario — prueba que está logueado |
| HttpOnly | La pulsera que JavaScript no puede ver ni robar |
| bcrypt | El que convierte contraseñas en hashes irreversibles |
| `protect` | El portero que verifica la pulsera antes de dejar pasar |
| `signToken` | El que crea la pulsera |
| `verifyToken` | El que comprueba si la pulsera es válida |
| `cookieParser` | El que enseña a Express a leer las cookies |
| `dotenv` | El que lee el archivo `.env` con los secretos |
