import { BadRequestException, PipeTransform } from "@nestjs/common"
import type { ZodType } from "zod"

/** `@Body(new ZodPipe(schema))` — validates with the shared contract from @waypoint/shared. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (!result.success)
      throw new BadRequestException({
        message: "Validation failed",
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      })
    return result.data
  }
}
