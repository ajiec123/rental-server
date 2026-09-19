Fase 1: Setup Server Node.js (Pusat Kendali / Operator)

Target: Server siap menjadi listener WebSocket, memiliki mDNS broadcast, dan mampu mengelola Room per unit TV.

    Inisialisasi Project Node.js:

        Install dependency utama: express, socket.io, bonjour-service (untuk mDNS), dan cors.

    Konfigurasi mDNS (Zero Setup Broadcast):

        Panggil bonjour.publish({ name: 'rental-server', type: 'http', port: 3000 }).

        Ini membuat server dapat ditemukan oleh Android TV via [http://rental-server.local:3000](http://rental-server.local:3000).

    Logika Socket.io Room Management:

        Buat event listener REGISTER_DEVICE: Saat TV mengirim unit_id (misal: TV-01), gabungkan Socket TV tersebut ke socket.join("room_TV-01").

        Buat event listener OPERATOR_COMMAND: Terima perintah dari aplikasi React (misal: START_SESSION), lalu teruskan sinyal hanya ke room target: io.to("room_" + targetUnit).emit("COMMAND_WAKE_AND_START", payload).

    Endpoint Sync Status (Timestamps-based):

        Sediakan API/Event untuk mengirimkan data end_time aktif saat TV baru saja restart atau mati listrik.