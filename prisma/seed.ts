// Seed data awal untuk Asisten AI WhatsApp Mukundo Teknologi
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const knowledgeSeed = [
  {
    category: 'layanan',
    title: 'Cuci & Perawatan AC',
    content:
      'Layanan cuci AC rutin agar AC tetap dingin maksimal, hemat listrik, dan lebih awet. Cocok untuk AC split 0,5-2 PK, standing floor, hingga kebutuhan komersial. Termasuk pembersihan filter, evaporator, blower, dan pengecekan freon.',
    keywords: 'cuci ac, servis berkala, perawatan ac, ac kurang dingin, ac kurang sejuk',
    sortOrder: 1,
  },
  {
    category: 'layanan',
    title: 'Perbaikan & Servis AC',
    content:
      'Perbaikan segala jenis kerusakan AC: tidak dingin, bocor air, bunyi berisik, mati total, kode error, kompresor bermasalah. Diagnosa akurat oleh teknisi bersertifikat dengan pengerjaan rapi dan bergaransi.',
    keywords: 'ac rusak, ac tidak dingin, ac bocor, ac mati, perbaikan ac, servis ac, kompresor',
    sortOrder: 2,
  },
  {
    category: 'layanan',
    title: 'Instalasi AC Baru',
    content:
      'Pemasangan AC baru dengan rapi dan aman: penentuan titik dudukan, perpipaan tembaga, drainase, dan kelistrikan sesuai standar. Untuk rumah tangga, kantor, toko, hingga industri.',
    keywords: 'pasang ac, instalasi ac, pasang ac baru, install ac',
    sortOrder: 3,
  },
  {
    category: 'layanan',
    title: 'Isi Freon & Cek Kebocoran',
    content:
      'Pengisian freon sesuai standar plus pengecekan kebocoran pipa dan sambungan agar performa AC kembali optimal. Tersedia berbagai jenis freon (R32, R410, R22, R290) sesuai spesifikasi AC.',
    keywords: 'isi freon, tambah freon, freon habis, freon bocor, gas freon',
    sortOrder: 4,
  },
  {
    category: 'layanan',
    title: 'Cool Storage & Mini Chiller',
    content:
      'Instalasi, perawatan, dan perbaikan sistem pendingin komersial dan industri: cool storage dan mini chiller untuk usaha yang membutuhkan suhu terkontrol (gudang, kuliner, farmasi).',
    keywords: 'cool storage, mini chiller, chiller, pendingin industri, cold storage',
    sortOrder: 5,
  },
  {
    category: 'layanan',
    title: 'Bongkar, Pindah & Reinstalasi AC',
    content:
      'Bongkar pasang AC saat pindah rumah, kantor, atau renovasi. Pengerjaan aman dan rapi, termasuk pengecekan ulang freon dan kelistrikan setelah dipasang di lokasi baru.',
    keywords: 'bongkar ac, pindah ac, uninstall ac, reinstall ac, pindahan',
    sortOrder: 6,
  },
  {
    category: 'layanan',
    title: 'Pasang Baru Daya PLN',
    content:
      'Pengurusan pasang baru daya listrik PLN dibantu dari tahap administrasi sampai meter terpasang dan siap pakai.',
    keywords: 'pasang baru pln, pasang daya, sambung listrik baru, pasang meteran',
    sortOrder: 7,
  },
  {
    category: 'layanan',
    title: 'Naik Daya PLN',
    content:
      'Penambahan daya listrik sesuai kebutuhan alat rumah atau usaha (misal dari 900 VA ke 1300/2200/3500 VA). Dibantu pengurusan administrasinya sampai selesai.',
    keywords: 'naik daya, tambah daya pln, upgrade daya',
    sortOrder: 8,
  },
  {
    category: 'layanan',
    title: 'Rubah Tarif PLN',
    content:
      'Penyesuaian golongan tarif dan daya meter listrik (misal tarif rumah tangga ke tarif usaha) sesuai kebutuhan dan ketentuan PLN.',
    keywords: 'rubah tarif, ubah tarif pln, golongan tarif',
    sortOrder: 9,
  },
  {
    category: 'layanan',
    title: 'Instalasi Kelistrikan',
    content:
      'Instalasi kelistrikan lengkap: titik lampu, stop kontak, panel distribusi (MCB/MCCB), hingga grounding untuk rumah dan bangunan. Pengerjaan sesuai standar K3.',
    keywords: 'instalasi listrik, pasang lampu, stop kontak, panel listrik, grounding',
    sortOrder: 10,
  },
  {
    category: 'layanan',
    title: 'Penyambungan Jaringan Listrik',
    content:
      'Penyambungan baru, perbaikan, dan pemeliharaan jaringan kabel listrik untuk rumah dan bangunan.',
    keywords: 'jaringan listrik, sambung kabel, perbaikan kabel',
    sortOrder: 11,
  },
  {
    category: 'layanan',
    title: 'Pengadaan & Sparepart Listrik',
    content:
      'Tersedia toko sparepart sendiri: meter prabayar, MCB, kabel, dan material listrik lain. Bisa sekalian dipasang oleh tim kami sehingga lebih cepat selesai.',
    keywords: 'sparepart, meter prabayar, token, mcb, kabel, beli material',
    sortOrder: 12,
  },
  {
    category: 'layanan',
    title: 'Restorasi Kerusakan & Home Security',
    content:
      'Di luar AC dan listrik, kami juga menangani restorasi kerusakan (akibat kebakaran, banjir, korsleting) serta pemasangan CCTV dan sistem keamanan rumah (home security).',
    keywords: 'cctv, kamera pengawas, restorasi, home security, alarm rumah',
    sortOrder: 13,
  },
  {
    category: 'layanan',
    title: 'Jasa Serba Bisa — Semua Bidang',
    content:
      'Selain AC dan kelistrikan, kami punya tim khusus yang siap mengerjakan hampir semua jenis pekerjaan: cor jalan / cor beton, bangun rumah & renovasi, servis HP, service laptop & komputer, perbaikan mesin apa pun (genset, pompa air, mesin usaha), restorasi, CCTV, dan jasa teknik lainnya. Apa pun kebutuhan Kakak, silakan tanyakan — tim kami siap bantu. Untuk pekerjaan di luar layanan inti, tim kami survey dulu lalu berikan penawaran transparan sebelum pengerjaan.',
    keywords: 'serba bisa, semua jasa, jasa lain, bisa semua, tim khusus, jasa umum, lift, bor sumur',
    sortOrder: 14,
  },
  {
    category: 'layanan',
    title: 'Cor Jalan & Konstruksi Bangunan',
    content:
      'Pengerjaan cor jalan, cor dak, pondasi, plesteran, hingga bangun rumah dan renovasi dikerjakan tim konstruksi kami — rumah, ruko, dan kebutuhan komersial. Tim survey datang ke lokasi untuk ukur dan hitung kebutuhan material, lalu kami sampaikan penawaran yang jelas sebelum mulai.',
    keywords: 'cor jalan, cor beton, cor dak, bangun rumah, renovasi, konstruksi, plester, pondasi',
    sortOrder: 15,
  },
  {
    category: 'layanan',
    title: 'Servis HP, Laptop & Komputer',
    content:
      'Perbaikan HP, laptop, dan perangkat elektronik: ganti komponen (layar, baterai, kamera), masalah software, laptop mati, HP kena air, dan lainnya dikerjakan teknisi kami. Estimasi biaya diberikan setelah pengecekan unit.',
    keywords: 'servis hp, service laptop, servis laptop, perbaikan hp, repair hp, laptop rusak, hp kena air, servis komputer',
    sortOrder: 16,
  },
  {
    category: 'layanan',
    title: 'Perbaikan & Perawatan Mesin',
    content:
      'Tim mekanik kami menangani perbaikan dan perawatan berbagai jenis mesin: genset, pompa air, mesin usaha, mesin industri, hingga mesin lainnya. Diagnosa dulu untuk tahu kerusakannya, lalu kami sampaikan solusi dan biayanya sebelum dikerjakan.',
    keywords: 'servis mesin, bengkel mesin, genset, pompa air, mesin rusak, perawatan mesin, mesin industri',
    sortOrder: 17,
  },
  {
    category: 'info',
    title: 'Profil & Keunggulan',
    content:
      'Mukundo Teknologi Indonesia adalah tim profesional jasa teknik SERBA BISA — layanan AC & kelistrikan ditangani tim inti, sementara pekerjaan lain (cor jalan, bangun rumah, servis HP/laptop, mesin, dll) ditangani tim khusus multi-bidang. Berdiri di balik workshop dan toko sparepart sendiri. 15+ teknisi berpengalaman & bersertifikat, 2.500+ proyek selesai, buka 24 jam, pengerjaan 100% bergaransi, harga transparan tanpa biaya tersembunyi. Melayani rumah, kantor, komersial, dan industri.',
    keywords: 'mukundo, tentang, profil, keunggulan, garansi, teknisi, serba bisa',
    sortOrder: 18,
  },
  {
    category: 'info',
    title: 'Area & Jam Operasional',
    content:
      'Berbasis di Kalijati, Subang, Jawa Barat. Siap melayani 24 jam setiap hari, termasuk keadaan darurat (AC bocor tengah malam, listrik bermasalah, dan pekerjaan darurat lain). Area layanan: Kalijati, Subang, dan sekitarnya.',
    keywords: 'jam buka, alamat, lokasi, area, 24 jam, darurat, subang, kalijati',
    sortOrder: 19,
  },
  {
    category: 'info',
    title: 'Website Resmi & Portofolio',
    content:
      'Website resmi kami: mukundoteknologi.com — berisi informasi lengkap layanan, portofolio/contoh proyek, dan cara pemesanan. Klien bisa langsung cek di sana untuk melihat hasil kerja kami sebelum memesan.',
    keywords: 'website, web, situs, portofolio, mukundoteknologi.com, online, link',
    sortOrder: 20,
  },
  {
    category: 'faq',
    title: 'Cara Order & Alur Kerja',
    content:
      'Alur kerja mudah: 1) Chat/telp kami dan ceritakan kebutuhan atau keluhan Anda (AC, listrik, bangun/renom, servis HP/laptop, mesin, dll), 2) Kami bantu diagnosa dan berikan estimasi biaya yang jelas sebelum pengerjaan, 3) Tim datang dan mengerjakan dengan rapi, 4) Pengerjaan bergaransi.',
    keywords: 'cara order, cara pesan, alur, proses, cara booking, jadwal',
    sortOrder: 21,
  },
  {
    category: 'faq',
    title: 'Estimasi Harga',
    content:
      'Harga bergantung pada jenis layanan, tingkat kerusakan, dan lokasi. Estimasi kasar bisa langsung ditanyakan via chat setelah kami tahu jenis layanan dan lokasinya. Harga pasti selalu transparan dan disampaikan jelas di awal — tanpa biaya tersembunyi di akhir. Survey/pengecekan bisa dijadwalkan.',
    keywords: 'harga, biaya, berapa, estimasi, murah, tarif',
    sortOrder: 22,
  },
]

async function main() {
  // AiSetting default (singleton)
  const settings = await db.aiSetting.upsert({
    where: { id: 'main' },
    update: {},
    create: {
      id: 'main',
      businessName: 'Mukundo Teknologi Indonesia',
      ownerName: 'Admin Mukundo',
      assistantName: 'Rani',
      persona: '',
      autoReplyEnabled: true,
      replyDelayMin: 2,
      replyDelayMax: 6,
      workHoursStart: '00:00',
      workHoursEnd: '23:59',
      outsideHoursReply: true,
      awayMessage:
        'Mohon maaf Kak, saat ini kami sedang di luar jam operasional. Pesan Kakak akan segera kami balas saat kembali aktif. Untuk keadaan darurat (AC bocor / listrik bermasalah / pekerjaan darurat lain), tim kami tetap siaga 24 jam ya!',
      greetingMessage:
        'Halo Kak! Terima kasih sudah menghubungi Mukundo Teknologi 😊 Ada yang bisa kami bantu? Servis AC, listrik, bangun-renom, servis HP/laptop, mesin — semua bisa kami kerjakan!',
      contextMessages: 16,
      typingIndicator: true,
    },
  })
  console.log('AiSetting siap:', settings.businessName)

  // Knowledge items
  for (const item of knowledgeSeed) {
    const existing = await db.knowledgeItem.findFirst({ where: { title: item.title } })
    if (!existing) {
      await db.knowledgeItem.create({ data: item })
    }
  }
  const total = await db.knowledgeItem.count()
  console.log('Knowledge items:', total)

  await db.activityLog.create({
    data: {
      type: 'settings',
      level: 'success',
      message: 'Sistem diinisialisasi: pengaturan AI & basis pengetahuan Mukundo Teknologi siap digunakan.',
    },
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
