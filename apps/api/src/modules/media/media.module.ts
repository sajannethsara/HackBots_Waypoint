import { Controller, ForbiddenException, Get, Module, NotFoundException, Param, Res } from "@nestjs/common"
import type { Response } from "express"
import { CurrentUser, type SessionUser } from "../../common/auth"
import { PrismaService } from "../../common/prisma.service"

/** Reads a photo back. Dispatch can open any; a store manager only photos that belong to their own outlet. */
@Controller("media")
export class MediaController {
  constructor(private readonly db: PrismaService) {}

  @Get(":id")
  async get(@CurrentUser() user: SessionUser, @Param("id") id: string, @Res() res: Response) {
    const asset = await this.db.mediaAsset.findUnique({ where: { id }, select: { mimeType: true, data: true } })
    if (!asset) throw new NotFoundException("Photo not found")
    if (!(await this.canView(user, id))) throw new ForbiddenException("You cannot view this photo")

    res.type(asset.mimeType)
    res.set("Cache-Control", "private, max-age=3600")
    res.send(Buffer.from(asset.data))
  }

  private async canView(user: SessionUser, id: string) {
    if (user.role === "DISPATCHER") return true
    if (user.role !== "STORE_MANAGER" || !user.outletId) return false
    const outletId = user.outletId
    const [issues, proofs] = await Promise.all([
      this.db.issue.count({ where: { OR: [{ photoId: id }, { photos: { some: { mediaId: id } } }], AND: [{ OR: [{ outletId }, { order: { outletId } }] }] } }),
      this.db.proofOfDelivery.count({ where: { OR: [{ photoId: id }, { signatureId: id }], stop: { order: { outletId } } } }),
    ])
    return issues + proofs > 0
  }
}

@Module({ controllers: [MediaController], })
export class MediaModule {}
