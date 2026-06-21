# Server Anemómetro

API REST en Node.js para recibir, almacenar y consultar lecturas de un anemómetro conectado por WiFi (ESP32). Los datos se guardan en SQLite y quedan disponibles para un dashboard u otras aplicaciones en la red local.

## Requisitos

- [Node.js](https://nodejs.org/) **22 o superior** (usa el módulo nativo `node:sqlite`)
- npm (incluido con Node.js)

## Instalación

1. Clona o descarga el repositorio y entra en la carpeta del proyecto:

```bash
cd server_anemometro
```

2. Instala las dependencias:

```bash
npm install
```

3. Crea el archivo de configuración a partir del ejemplo:

```bash
cp .env.example .env
```

4. Edita `.env` y define tus variables:

| Variable  | Descripción                                      | Valor por defecto |
|-----------|--------------------------------------------------|-------------------|
| `PORT`    | Puerto en el que escucha el servidor             | `3000`            |
| `API_KEY` | Clave para proteger el endpoint de escritura     | *(opcional)*      |

Si no defines `API_KEY`, el endpoint `POST /api/lecturas` quedará abierto (útil solo para pruebas locales).

## Iniciar el servidor

```bash
npm start
```

Al arrancar verás algo como:

```
API del anemometro escuchando en el puerto 3000
Servidor corriendo en http://192.168.1.42:3000
```

La segunda línea muestra la **IP local de tu red WiFi**, para que puedas configurar el ESP32 u otros dispositivos en la misma red. Sustituye la IP y el puerto según lo que aparezca en tu consola.

## Base de datos

Al iniciar el servidor se crea (o reutiliza) el archivo `anemometro.db` en la raíz del proyecto. Cada lectura incluye:

| Campo         | Tipo    | Descripción                          |
|---------------|---------|--------------------------------------|
| `id`          | integer | Identificador autoincremental        |
| `vuelta`      | integer | Número de vuelta del sensor          |
| `marca_ms`    | integer | Marca de tiempo en milisegundos      |
| `periodo_s`   | real    | Periodo de rotación en segundos      |
| `omega_rad_s` | real    | Velocidad angular (rad/s)            |
| `v_real_m_s`  | real    | Velocidad del viento (m/s)           |
| `km_h`        | real    | Velocidad del viento (km/h)          |
| `recibido_en` | texto   | Fecha/hora de recepción en el servidor |

---

## Endpoints

Base URL: `http://<IP_LOCAL>:<PORT>` (por ejemplo `http://192.168.1.42:3000`).

### `GET /`

Comprobación rápida de que el servidor responde.

**Respuesta `200`**

```json
{ "message": "Hello World" }
```

---

### `POST /api/lecturas`

Registra una nueva lectura enviada por el ESP32.

**Autenticación:** opcional. Si `API_KEY` está definida en `.env`, incluye la clave en la cabecera:

```
X-API-Key: tu_clave_secreta
```

**Cuerpo (JSON)** — todos los campos son obligatorios:

```json
{
  "vuelta": 42,
  "marca_ms": 1234567890,
  "periodo_s": 0.85,
  "omega_rad_s": 7.39,
  "v_real_m_s": 3.2,
  "km_h": 11.5
}
```

**Respuestas**

| Código | Descripción                                      |
|--------|--------------------------------------------------|
| `201`  | Lectura guardada correctamente                   |
| `400`  | Faltan campos en el cuerpo de la petición        |
| `401`  | API key inválida o ausente                       |

**Ejemplo con curl**

```bash
curl -X POST http://192.168.1.42:3000/api/lecturas \
  -H "Content-Type: application/json" \
  -H "X-API-Key: tu_clave_secreta" \
  -d '{
    "vuelta": 42,
    "marca_ms": 1234567890,
    "periodo_s": 0.85,
    "omega_rad_s": 7.39,
    "v_real_m_s": 3.2,
    "km_h": 11.5
  }'
```

---

### `GET /api/lecturas`

Devuelve el histórico de lecturas, ordenadas de la más antigua a la más reciente.

**Query params**

| Parámetro | Descripción                          | Por defecto | Máximo |
|-----------|--------------------------------------|-------------|--------|
| `limit`   | Cantidad de lecturas a devolver      | `100`       | `1000` |

**Respuesta `200`** — array de objetos con todos los campos de la tabla.

**Ejemplo**

```bash
curl "http://192.168.1.42:3000/api/lecturas?limit=50"
```

---

### `GET /api/lecturas/ultima`

Devuelve únicamente la lectura más reciente.

**Respuesta `200`**

- Objeto con la lectura si existe.
- Objeto vacío `{}` si aún no hay datos.

**Ejemplo**

```bash
curl http://192.168.1.42:3000/api/lecturas/ultima
```

---

### `GET /api/status`

Estado del servicio y conteo total de lecturas almacenadas.

**Respuesta `200`**

```json
{
  "ok": true,
  "total_lecturas": 128
}
```

**Ejemplo**

```bash
curl http://192.168.1.42:3000/api/status
```

---

## Estructura del proyecto

```
server_anemometro/
├── server.js        # Servidor Express y lógica de la API
├── anemometro.db    # Base de datos SQLite (se genera al iniciar)
├── .env.example     # Plantilla de variables de entorno
├── package.json
└── README.md
```

## Notas

- El servidor acepta peticiones CORS desde cualquier origen (útil para dashboards web en la red local).
- Mantén `.env` fuera del control de versiones; no subas claves secretas al repositorio.
- Para uso en producción, define siempre una `API_KEY` robusta y restringe el acceso de red según tu entorno.
