import "reflect-metadata"
import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import cookieParser from "cookie-parser"
import { AppModule } from "./app.module"

// Dev convenience: read the repo-root .env when present (Docker passes real env vars).
for (const f of [".env", "../../.env"]) {
  try {
    process.loadEnvFile(f)
    break
  } catch {}
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix("api")
  app.use(cookieParser())
  app.enableCors({ origin: true, credentials: true })
  app.enableShutdownHooks()
  const port = Number(process.env.PORT ?? 4000)
  await app.listen(port)
  Logger.log(`Waypoint API on http://localhost:${port}/api`, "Bootstrap")
}
bootstrap()
