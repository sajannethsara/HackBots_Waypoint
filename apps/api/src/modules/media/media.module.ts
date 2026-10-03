import { BadRequestException, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Res } from "@nestjs/common"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import type { Response } from "express"
import { CurrentUser, type SessionUser } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]))
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/

/** The uploads folder: UPLOAD_DIR, else `uploads/` at the repo root (found by walking up to pnpm-workspace.yaml). */
function uploadRoot() {
  if (process.env.UPLOAD_DIR) return resolve(process.env.UPLOAD_DIR)
  let dir = __dirname
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return join(dir, "uploads")
    dir = dirname(dir)
  }
  return resolve(process.cwd(), "uploads")
}

/**
 * Where uploaded files live. Today it is a folder in the repo so teammates can see the files in git;
 * moving to a bucket means replacing `save` and `read` here and nothing else.
 */
@Injectable()
export class MediaStorage {
  readonly root = uploadRoot()

  /** Saves bytes under `<folder>/<id>.<ext>` and returns the path relative to the uploads root. */
  async save(input: { id: string; mimeType: string; bytes: Buffer; folder: string }): Promise<string> {
    const ext = EXT[input.mimeType]
    if (!ext) throw new BadRequestException("Only JPEG, PNG or WebP photos can be uploaded.")
    if (!SAFE_ID.test(input.id)) throw new BadRequestException("Invalid photo id.")
    const rel = `${input.folder}/${input.id}.${ext}`.replace(/\\/g, "/")
    const full = this.resolveInside(rel)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, input.bytes)
    return rel
  }

  async read(rel: string): Promise<Buffer> {
    return readFile(this.resolveInside(rel))
  }

  /** Never lets a stored path leave the uploads folder. */
  private resolveInside(rel: string) {
    const full = resolve(this.root, rel)
    if (full !== this.root && !full.startsWith(this.root + sep)) throw new BadRequestException("Invalid file path.")
    return full
  }
}

/** Reads a photo back. Dispatch can open any; a store manager only photos that belong to their own outlet. */
@Controller("media")
export class MediaController {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: MediaStorage,
  ) {}

  @Get(":id")
  async get(@CurrentUser() user: SessionUser, @Param("id") id: string, @Res() res: Response) {
    const asset = await this.db.mediaAsset.findUnique({ where: { id }, select: { mimeType: true, data: true, filePath: true } })
    if (!asset) throw new NotFoundException("Photo not found")
    if (!(await this.canView(user, id))) throw new ForbiddenException("You cannot view this photo")

    let bytes: Buffer
    try {
      bytes = asset.filePath ? await this.storage.read(asset.filePath) : Buffer.from(asset.data)
    } catch {
      throw new NotFoundException("The photo file is missing from the uploads folder")
    }
    const ext = asset.filePath?.split(".").pop()
    res.type(asset.filePath ? (MIME_BY_EXT[ext ?? ""] ?? asset.mimeType) : asset.mimeType)
    res.set("Cache-Control", "private, max-age=3600")
    res.send(bytes)
  }

  private async canView(user: SessionUser, id: string) {
    if (user.role === "DISPATCHER") return true
    if (user.role !== "STORE_MANAGER" || !user.outletId) return false
    const outletId = user.outletId
    const [issues, proofs] = await Promise.all([
      this.db.issue.count({ where: { photoId: id, OR: [{ outletId }, { order: { outletId } }] } }),
      this.db.proofOfDelivery.count({ where: { OR: [{ photoId: id }, { signatureId: id }], stop: { order: { outletId } } } }),
    ])
    return issues + proofs > 0
  }
}

@Module({ controllers: [MediaController], providers: [MediaStorage], exports: [MediaStorage] })
export class MediaModule {}
