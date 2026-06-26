const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, Events } = require('discord.js');
const fs = require('fs');
const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const port = 3000;

// Config ve dosyaları oku
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const emoji = JSON.parse(fs.readFileSync('./emoji.json', 'utf8'));
const panelData = JSON.parse(fs.readFileSync('./panel.json', 'utf8'));
const verifyMessageData = JSON.parse(fs.readFileSync('./verify-message.json', 'utf8'));

// Statik dosyaları serve et
app.use(express.static('public'));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// OAuth2 state kontrolü için
let pendingVerifications = new Map();

// ============ EXPRESS SUNUCUSU ============
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>AURA Doğrulama Sistemi</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 50%, #0a0a0a 100%);
                        min-height: 100vh;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        color: white;
                        text-align: center;
                        margin: 0;
                    }
                    .container {
                        background: rgba(255,255,255,0.05);
                        padding: 60px;
                        border-radius: 30px;
                        backdrop-filter: blur(10px);
                        border: 1px solid rgba(255,255,255,0.1);
                        max-width: 500px;
                        width: 100%;
                    }
                    .logo {
                        font-size: 80px;
                        margin-bottom: 20px;
                        background: linear-gradient(135deg, #00ff88, #00cc66);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        font-weight: 900;
                    }
                    h1 { 
                        font-size: 42px; 
                        margin-bottom: 10px;
                        background: linear-gradient(135deg, #00ff88, #5865F2);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        font-weight: 800;
                    }
                    .subtitle {
                        color: #8888aa;
                        font-size: 16px;
                        margin-top: 10px;
                    }
                    .status { 
                        color: #00ff88; 
                        font-size: 18px;
                        margin-top: 15px;
                    }
                    .loading {
                        display: inline-block;
                        width: 20px;
                        height: 20px;
                        border: 3px solid rgba(255,255,255,0.1);
                        border-radius: 50%;
                        border-top-color: #00ff88;
                        animation: spin 1s ease-in-out infinite;
                        margin-top: 20px;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    .footer {
                        margin-top: 30px;
                        color: #444466;
                        font-size: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo">AURA</div>
                    <h1>Doğrulama Sistemi</h1>
                    <p class="subtitle">Güvenli giriş ile devam edin</p>
                    <div class="status">✅ Sistem çalışıyor</div>
                    <div class="loading"></div>
                    <div class="footer">AURA SCRIPT HUB v3.0</div>
                </div>
            </body>
        </html>
    `);
});

// OAuth2 yetkilendirme callback'i
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
        return res.send(`
            <html>
                <head><title>Hata</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                    <h1 style="color: #ff4444;">❌ Hata</h1>
                    <p>Doğrulama kodu bulunamadı!</p>
                    <p style="color: #8888aa;">Lütfen tekrar deneyin.</p>
                    <button onclick="window.close()" style="padding: 10px 30px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 20px;">Kapat</button>
                </body>
            </html>
        `);
    }

    try {
        // Access token al
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: config.redirectUri
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const { access_token, token_type } = tokenResponse.data;

        // Kullanıcı bilgilerini al
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `${token_type} ${access_token}`
            }
        });

        const user = userResponse.data;
        const userId = user.id;

        // State'ten guildId ve discordUserId'yi al
        const stateData = pendingVerifications.get(state);
        if (!stateData) {
            return res.send(`
                <html>
                    <head><title>Hata</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                        <h1 style="color: #ff4444;">❌ Geçersiz Oturum</h1>
                        <p>Oturum süresi dolmuş veya geçersiz.</p>
                        <p style="color: #8888aa;">Lütfen Discord'da tekrar doğrulama butonuna tıklayın.</p>
                        <button onclick="window.close()" style="padding: 10px 30px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 20px;">Kapat</button>
                    </body>
                </html>
            `);
        }

        const { guildId, discordUserId } = stateData;

        // Kullanıcının botu yetkilendirdiğini kontrol et
        const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: {
                Authorization: `${token_type} ${access_token}`
            }
        });

        const userGuilds = guildsResponse.data;
        const isAuthorized = userGuilds.some(g => g.id === guildId);

        if (!isAuthorized) {
            return res.send(`
                <html>
                    <head><title>Hata</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                        <h1 style="color: #ff4444;">❌ Yetkilendirme Başarısız</h1>
                        <p>Botu yetkilendirmediniz!</p>
                        <p style="color: #8888aa;">Lütfen Discord'da tekrar doğrulama butonuna tıklayın.</p>
                        <button onclick="window.close()" style="padding: 10px 30px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 20px;">Kapat</button>
                    </body>
                </html>
            `);
        }

        // Discord botuna rol vermesi için mesaj gönder
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
            return res.send(`
                <html>
                    <head><title>Hata</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                        <h1 style="color: #ff4444;">❌ Sunucu Bulunamadı</h1>
                        <p>Doğrulama yapılan sunucu bulunamadı.</p>
                        <button onclick="window.close()" style="padding: 10px 30px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 20px;">Kapat</button>
                    </body>
                </html>
            `);
        }

        const member = await guild.members.fetch(discordUserId);
        if (!member) {
            return res.send(`
                <html>
                    <head><title>Hata</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                        <h1 style="color: #ff4444;">❌ Kullanıcı Bulunamadı</h1>
                        <p>Discord kullanıcısı bulunamadı.</p>
                        <button onclick="window.close()" style="padding: 10px 30px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 20px;">Kapat</button>
                    </body>
                </html>
            `);
        }

        // Verify rolünü kontrol et
        const verifyRole = guild.roles.cache.get(config.verifyRoleId);
        if (!verifyRole) {
            return res.send(`
                <html>
                    <head><title>Hata</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                        <h1 style="color: #ff4444;">❌ Rol Bulunamadı</h1>
                        <p>Doğrulama rolü sunucuda bulunamadı.</p>
                        <button onclick="window.close()" style="padding: 10px 30px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 20px;">Kapat</button>
                    </body>
                </html>
            `);
        }

        // Alınacak rolü kontrol et (opsiyonel)
        if (config.removeRoleId && config.removeRoleId !== "ROL_ID" && config.removeRoleId !== "") {
            const removeRole = guild.roles.cache.get(config.removeRoleId);
            if (removeRole && member.roles.cache.has(config.removeRoleId)) {
                await member.roles.remove(removeRole);
                console.log(`${emoji.ok} ${member.user.tag} kullanıcısından ${removeRole.name} rolü alındı.`);
            }
        }

        // Verify rolünü ver
        await member.roles.add(verifyRole);
        
        // Bekleyen doğrulamayı temizle
        pendingVerifications.delete(state);

        console.log(`${emoji.ok} ${member.user.tag} kullanıcısı OAuth2 ile doğrulandı.`);

        // BAŞARILI SAYFASI
        res.send(`
            <html>
                <head>
                    <title>✅ Doğrulama Başarılı | AURA</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background: linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 40%, #0a1a0a 100%);
                            min-height: 100vh;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            padding: 20px;
                        }
                        .container {
                            background: rgba(255, 255, 255, 0.03);
                            backdrop-filter: blur(20px);
                            border-radius: 30px;
                            padding: 50px;
                            max-width: 500px;
                            width: 100%;
                            text-align: center;
                            border: 1px solid rgba(0, 255, 136, 0.15);
                            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8);
                        }
                        .logo {
                            font-size: 60px;
                            font-weight: 900;
                            background: linear-gradient(135deg, #00ff88, #00cc66);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                            letter-spacing: 5px;
                            margin-bottom: 5px;
                        }
                        .logo-sub {
                            color: #445566;
                            font-size: 12px;
                            letter-spacing: 8px;
                            text-transform: uppercase;
                            margin-bottom: 25px;
                        }
                        .success-icon {
                            font-size: 60px;
                            display: inline-block;
                            background: linear-gradient(135deg, #00ff88, #00cc66);
                            border-radius: 50%;
                            width: 100px;
                            height: 100px;
                            line-height: 100px;
                            box-shadow: 0 0 60px rgba(0, 255, 136, 0.2);
                            margin-bottom: 20px;
                        }
                        h1 {
                            color: #ffffff;
                            font-size: 28px;
                            margin-bottom: 8px;
                            background: linear-gradient(135deg, #00ff88, #00cc66);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                        }
                        .subtitle {
                            color: #8899aa;
                            font-size: 15px;
                            margin-bottom: 20px;
                        }
                        .user-info {
                            background: rgba(0, 255, 136, 0.05);
                            border-radius: 12px;
                            padding: 15px;
                            margin: 15px 0;
                            border: 1px solid rgba(0, 255, 136, 0.08);
                        }
                        .user-info .username {
                            color: #ffffff;
                            font-size: 20px;
                            font-weight: 600;
                            background: linear-gradient(135deg, #ffffff, #00ff88);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                        }
                        .status-text {
                            color: #00ff88;
                            font-weight: 500;
                            margin: 15px 0;
                        }
                        .close-btn {
                            background: linear-gradient(135deg, #00ff88, #00cc66);
                            color: #0a0a0a;
                            border: none;
                            padding: 12px 35px;
                            border-radius: 12px;
                            font-size: 15px;
                            font-weight: 700;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            margin-top: 15px;
                            width: 100%;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                        }
                        .close-btn:hover {
                            transform: translateY(-2px);
                            box-shadow: 0 10px 30px rgba(0, 255, 136, 0.3);
                        }
                        .footer {
                            margin-top: 20px;
                            color: #334455;
                            font-size: 11px;
                            letter-spacing: 3px;
                            text-transform: uppercase;
                        }
                        .footer .highlight {
                            color: #00ff88;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="logo">AURA</div>
                        <div class="logo-sub">SCRIPT HUB</div>
                        <div class="success-icon">✅</div>
                        <h1>Doğrulama Başarılı!</h1>
                        <p class="subtitle">Hesabınız başarıyla doğrulandı</p>
                        <div class="user-info">
                            <div class="username">${user.username}#${user.discriminator}</div>
                        </div>
                        <div class="status-text">✅ Artık Discord'a dönebilirsiniz</div>
                        <button class="close-btn" onclick="window.close()">✕ Sayfayı Kapat</button>
                        <div class="footer">
                            <span class="highlight">★</span> AURA SCRIPT HUB v3.0 <span class="highlight">★</span>
                        </div>
                    </div>
                    <script>
                        setTimeout(() => {
                            window.close();
                        }, 5000);
                    </script>
                </body>
            </html>
        `);

    } catch (error) {
        console.error('OAuth2 hatası:', error);
        res.send(`
            <html>
                <head><title>Hata</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                    <h1 style="color: #ff4444;">❌ Bir Hata Oluştu</h1>
                    <p>${error.message}</p>
                    <p style="color: #8888aa;">Lütfen tekrar deneyin.</p>
                    <button onclick="window.close()" style="padding: 10px 30px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 20px;">Kapat</button>
                </body>
            </html>
        `);
    }
});

// Express server'ı başlat
app.listen(port, '0.0.0.0', () => {
    console.log(`${emoji.ok} OAuth2 sunucusu http://localhost:${port} adresinde çalışıyor`);
});

// ============ DISCORD BOT ============

// Komutları kaydetme
async function registerCommands() {
    const commands = [
        {
            name: 'panelkur',
            description: 'Doğrulama panelini kurar (Sadece Sunucu Sahibi)',
        }
    ];

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log(`${emoji.simsek} Komutlar kaydediliyor...`);
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands }
        );
        console.log(`${emoji.ok} Komutlar başarıyla kaydedildi!`);
    } catch (error) {
        console.error(`${emoji.dikkat} Komut kaydedilirken hata:`, error);
    }
}

// Slash komutları
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'panelkur') {
        if (interaction.user.id !== config.ownerId) {
            return interaction.reply({
                content: `${emoji.dikkat} Bu komutu sadece sunucu sahibi kullanabilir!`,
                ephemeral: true
            });
        }

        try {
            await createVerifyPanel(interaction);
        } catch (error) {
            console.error('Panel oluşturma hatası:', error);
            await interaction.reply({
                content: `${emoji.dikkat} Panel oluşturulurken bir hata oluştu.`,
                ephemeral: true
            });
        }
    }

    // Button interaction
    if (interaction.isButton()) {
        if (interaction.customId === 'verify_button_oauth') {
            const member = interaction.member;
            const verifyRole = interaction.guild.roles.cache.get(config.verifyRoleId);

            if (!verifyRole) {
                return interaction.reply({
                    content: `${emoji.dikkat} Doğrulama rolü bulunamadı!`,
                    ephemeral: true
                });
            }

            // Zaten doğrulanmış mı?
            if (member.roles.cache.has(config.verifyRoleId)) {
                return interaction.reply({
                    content: `${emoji.ok} Zaten doğrulanmışsınız!`,
                    ephemeral: true
                });
            }

            // Benzersiz state oluştur
            const state = Math.random().toString(36).substring(7);
            pendingVerifications.set(state, {
                guildId: interaction.guildId,
                discordUserId: interaction.user.id
            });

            // OAuth2 yetkilendirme linki - verify-message.json'dan oku
            let verifyMessage = JSON.parse(JSON.stringify(verifyMessageData));
            
            // Linki güncelle
            const authUrl = `https://discord.com/oauth2/authorize?client_id=${config.clientId}&response_type=code&redirect_uri=${encodeURIComponent(config.redirectUri)}&scope=identify%20guilds&state=${state}`;
            
            // Embed'deki linki güncelle
            if (verifyMessage.embeds && verifyMessage.embeds[0]) {
                verifyMessage.embeds[0].description = verifyMessage.embeds[0].description.replace(
                    /https:\/\/discord\.com\/oauth2\/authorize\?client_id=\.\.\.&response_type=code&redirect_uri=\.\.\.&scope=identify%20guilds&state=\.\.\./g,
                    authUrl
                );
            }

            // Embed oluştur
            const embed = new EmbedBuilder(verifyMessage.embeds[0]);

            // Butona tıklayan kişiye özel mesaj gönder
            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

            console.log(`${emoji.soruişareti} ${member.user.tag} doğrulama linki istedi.`);
        }
    }
});

// Message Commands (`.panelkur` için yedek)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || message.channel.type === 1) return;

    if (message.content.toLowerCase() === '.panelkur') {
        if (message.author.id !== config.ownerId) {
            return message.reply({
                content: `${emoji.dikkat} Bu komutu sadece sunucu sahibi kullanabilir!`,
                allowedMentions: { repliedUser: false }
            });
        }

        try {
            await createVerifyPanel(message);
        } catch (error) {
            console.error('Panel oluşturma hatası:', error);
            await message.reply(`${emoji.dikkat} Panel oluşturulurken bir hata oluştu.`);
        }
    }
});

// Panel oluşturma fonksiyonu
async function createVerifyPanel(context) {
    // panel.json'dan verileri al
    const panelEmbed = new EmbedBuilder(panelData.embeds[0]);

    // Buton oluştur
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('verify_button_oauth')
                .setLabel('Hesabını Yetkilendir')
                .setStyle(ButtonStyle.Success)
                .setEmoji(emoji.simsek || '⚡')
        );

    if (context.reply) {
        await context.reply({
            embeds: [panelEmbed],
            components: [row]
        });
    } else {
        await context.channel.send({
            embeds: [panelEmbed],
            components: [row]
        });
        await context.reply({
            content: `${emoji.ok} Doğrulama paneli başarıyla oluşturuldu!`,
            allowedMentions: { repliedUser: false }
        });
    }
}

// Guild Member Update - Yetki kaldırma kontrolü
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (newMember.user.bot) return;

    const verifyRole = newMember.guild.roles.cache.get(config.verifyRoleId);
    if (!verifyRole) return;

    const hadRole = oldMember.roles.cache.has(config.verifyRoleId);
    const hasRole = newMember.roles.cache.has(config.verifyRoleId);

    if (hadRole && !hasRole) {
        try {
            await newMember.roles.add(verifyRole);
            console.log(`${emoji.simsek} ${newMember.user.tag} kullanıcısından rol kaldırıldı, tekrar verildi.`);
        } catch (error) {
            console.error(`${emoji.dikkat} Rol tekrar verme hatası:`, error);
        }
    }
});

// Bot hazır olduğunda
client.on(Events.ClientReady, async () => {
    console.log(`${emoji.kalp} Bot olarak giriş yapıldı: ${client.user.tag}`);
    console.log(`${emoji.users} Sunucu Sahibi ID: ${config.ownerId}`);
    console.log(`${emoji.yıldız} Verify Rolü ID: ${config.verifyRoleId}`);
    if (config.removeRoleId && config.removeRoleId !== "ROL_ID" && config.removeRoleId !== "") {
        console.log(`${emoji.simsek} Alınacak Rol ID: ${config.removeRoleId}`);
    }
    console.log(`${emoji.ok} Redirect URI: ${config.redirectUri}`);
    
    await registerCommands();
});

// Botu başlat
client.login(config.token).catch(error => {
    console.error(`${emoji.dikkat} Bot giriş yaparken hata:`, error);
});

process.on('unhandledRejection', error => {
    console.error(`${emoji.dikkat} Yakalanmamış hata:`, error);
});