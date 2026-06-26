const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, Events } = require('discord.js');
const fs = require('fs');
const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// Config dosyasını oku (sadece redirectUri için)
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Çevre değişkenlerinden gizli bilgileri al
const token = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const guildId = process.env.GUILD_ID;
const ownerId = process.env.OWNER_ID;
const verifyRoleId = process.env.VERIFY_ROLE_ID;
const removeRoleId = process.env.REMOVE_ROLE_ID || "";

// Bot tokeni kontrol et
if (!token) {
    console.error('❌ BOT_TOKEN çevre değişkeni tanımlanmamış!');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

let pendingVerifications = new Map();

// ============ EXPRESS SUNUCUSU ============
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>AURA Doğrulama Sistemi</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                <h1 style="color: #00ff88;">🌟 AURA</h1>
                <p>Doğrulama sistemi çalışıyor! ✅</p>
                <p style="color: #8888aa;">AURA SCRIPT HUB v3.0</p>
            </body>
        </html>
    `);
});

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
        return res.send(`
            <html>
                <head><title>Hata</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                    <h1 style="color: #ff4444;">❌ Hata</h1>
                    <p>Doğrulama kodu bulunamadı!</p>
                    <button onclick="window.close()" style="padding: 10px 30px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer;">Kapat</button>
                </body>
            </html>
        `);
    }

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
            new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: config.redirectUri
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const { access_token, token_type } = tokenResponse.data;

        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `${token_type} ${access_token}` }
        });

        const user = userResponse.data;

        const stateData = pendingVerifications.get(state);
        if (!stateData) {
            return res.send(`
                <html>
                    <head><title>Hata</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                        <h1 style="color: #ff4444;">❌ Geçersiz Oturum</h1>
                        <button onclick="window.close()" style="padding: 10px 30px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer;">Kapat</button>
                    </body>
                </html>
            `);
        }

        const { guildId: stateGuildId, discordUserId } = stateData;

        const guild = await client.guilds.fetch(stateGuildId);
        const member = await guild.members.fetch(discordUserId);
        const verifyRole = guild.roles.cache.get(verifyRoleId);

        if (!verifyRole) {
            return res.send(`
                <html>
                    <head><title>Hata</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                        <h1 style="color: #ff4444;">❌ Rol Bulunamadı</h1>
                        <button onclick="window.close()" style="padding: 10px 30px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer;">Kapat</button>
                    </body>
                </html>
            `);
        }

        if (removeRoleId && removeRoleId !== "") {
            const removeRole = guild.roles.cache.get(removeRoleId);
            if (removeRole && member.roles.cache.has(removeRoleId)) {
                await member.roles.remove(removeRole);
            }
        }

        await member.roles.add(verifyRole);
        pendingVerifications.delete(state);

        console.log(`✅ ${member.user.tag} doğrulandı!`);

        res.send(`
            <html>
                <head><title>✅ Doğrulama Başarılı</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                    <h1 style="color: #00ff88;">✅ Doğrulama Başarılı!</h1>
                    <p style="font-size: 24px;">${user.username}#${user.discriminator}</p>
                    <p style="color: #8888aa;">Artık Discord'a dönebilirsin.</p>
                    <button onclick="window.close()" style="padding: 10px 30px; background: #00ff88; color: #0a0a0a; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">Kapat</button>
                    <script>setTimeout(() => window.close(), 5000);</script>
                </body>
            </html>
        `);

    } catch (error) {
        console.error('OAuth2 hatası:', error);
        res.send(`
            <html>
                <head><title>Hata</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px; background: #0a0a0a; color: white;">
                    <h1 style="color: #ff4444;">❌ Hata</h1>
                    <p>${error.message}</p>
                    <button onclick="window.close()" style="padding: 10px 30px; background: #5865F2; color: white; border: none; border-radius: 8px; cursor: pointer;">Kapat</button>
                </body>
            </html>
        `);
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Sunucu http://localhost:${port} adresinde çalışıyor`);
});

// ============ DISCORD BOT ============

async function registerCommands() {
    const commands = [
        { name: 'panelkur', description: 'Doğrulama panelini kurar (Sadece Sunucu Sahibi)' }
    ];

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log('⚡ Komutlar kaydediliyor...');
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );
        console.log('✅ Komutlar başarıyla kaydedildi!');
    } catch (error) {
        console.error('❌ Komut hatası:', error);
    }
}

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'panelkur') {
        if (interaction.user.id !== ownerId) {
            return interaction.reply({
                content: '❌ Bu komutu sadece sunucu sahibi kullanabilir!',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#00ff88')
            .setTitle('🌟 AURA | Sunucu Doğrulama')
            .setDescription('Sunucuya tam erişim için Discord hesabınızı yetkilendirmeniz gerekmektedir.')
            .addFields(
                { name: '❓ Nasıl Doğrulanır?', value: 'Aşağıdaki **Yetkilendir** butonuna tıklayın.', inline: false },
                { name: '⚠️ Uyarı', value: 'Yetkilendirme tamamlandıktan sonra otomatik olarak doğrulanacaksınız.', inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Aura • Güvenli Giriş Sistemi' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_button')
                    .setLabel('🔑 Hesabını Yetkilendir')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🔑')
            );

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
    }

    if (interaction.isButton() && interaction.customId === 'verify_button') {
        const member = interaction.member;
        const verifyRole = interaction.guild.roles.cache.get(verifyRoleId);

        if (!verifyRole) {
            return interaction.reply({
                content: '❌ Doğrulama rolü bulunamadı!',
                ephemeral: true
            });
        }

        if (member.roles.cache.has(verifyRoleId)) {
            return interaction.reply({
                content: '✅ Zaten doğrulanmışsınız!',
                ephemeral: true
            });
        }

        const state = Math.random().toString(36).substring(7);
        pendingVerifications.set(state, {
            guildId: interaction.guildId,
            discordUserId: interaction.user.id
        });

        const authUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(config.redirectUri)}&scope=identify%20guilds&state=${state}`;

        await interaction.reply({
            content: `🔐 **Doğrulama linkiniz:**\n${authUrl}\n\n⚠️ Linke tıklayıp Discord'da yetkilendirin.`,
            ephemeral: true
        });
    }
});

client.on(Events.ClientReady, async () => {
    console.log(`✅ Bot olarak giriş yapıldı: ${client.user.tag}`);
    console.log(`👤 Sunucu Sahibi ID: ${ownerId}`);
    console.log(`🎯 Verify Rolü ID: ${verifyRoleId}`);
    await registerCommands();
});

client.login(token).catch(error => {
    console.error('❌ Bot giriş hatası:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Yakalanmamış hata:', error);
});
