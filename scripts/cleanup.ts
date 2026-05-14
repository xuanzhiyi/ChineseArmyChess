import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.room.deleteMany({
    where: { status: 'waiting', createdAt: { lt: cutoff } },
  });
  console.log(`Deleted ${count} stale rooms`);
}

main().finally(() => prisma.$disconnect());
