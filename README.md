# VideoSave

Descargador de videos desde YouTube, TikTok, Instagram, Facebook y Twitter/X. Corre como un servidor Node.js dentro de Docker.

## Requisitos

Solo necesitas tener instalado **Docker Desktop**:

- Mac: https://www.docker.com/products/docker-desktop
- Windows: https://www.docker.com/products/docker-desktop
- Linux: https://docs.docker.com/engine/install

Verifica que Docker esté corriendo:

```bash
docker --version
docker compose version
```

No necesitas instalar Node.js, Python, ffmpeg ni yt-dlp de forma local. Todo se instala dentro del contenedor automáticamente al compilar.

---

## Compilar el proyecto

```bash
docker compose build
```

Este comando construye la imagen Docker e instala internamente:

- Node.js 18
- Python 3
- ffmpeg
- yt-dlp (última versión)
- Dependencias npm (express, cors)

La primera vez puede tardar 1-2 minutos dependiendo de tu conexión.

---

## Levantar el servidor

```bash
docker compose up -d
```

El servidor queda disponible en: **http://localhost:3000**

---

## Detener el servidor

```bash
docker compose down
```

---

## Compilar y levantar en un solo paso

```bash
docker compose up -d --build
```

---

## Ver logs

```bash
docker compose logs -f
```

---

## Plataformas soportadas

| Plataforma | URL de ejemplo |
|---|---|
| YouTube | youtube.com, youtu.be |
| TikTok | tiktok.com, vt.tiktok.com |
| Instagram | instagram.com |
| Facebook | facebook.com, fb.watch |
| Twitter / X | twitter.com, x.com |

---

## Estructura del proyecto

```
VideoSave/
├── public/         # Frontend (index.html)
├── server.js       # Servidor Express con endpoints de descarga
├── package.json    # Dependencias Node.js
├── Dockerfile      # Imagen Docker
└── docker-compose.yml
```
