import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const r = await db.$queryRawUnsafe('PRAGMA journal_mode=WAL;') as any
  console.log('journal_mode:', JSON.stringify(r))
  await db.$disconnect()
}
main()
