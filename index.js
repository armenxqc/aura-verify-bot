const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes, Events } = require('discord.js');
const fs = require('fs');
const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Config, emoji ve panel dosyalarını oku
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const emoji = JSON.parse(fs.readFileSync('./emoji.json', 'utf8')); // ← EMOJI TANIMLANDI
const panelData = JSON.parse(fs.readFileSync('./panel.json', 'utf8'));
const verifyMessageData = JSON.parse(fs.readFileSync('./verify-message.json', 'utf8'));

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

// Statik dosyaları serve et
app.use(express.static(__dirname));

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Başarılı sayfası
app.get('/success', (req, res) => {
    res.sendFile(path.join(__dirname, 'success.html'));
});

// Başarısız sayfası
app.get('/fail', (req, res) => {
    res.sendFile(path.join(__dirname, 'fail.html'));
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});

let pendingVerifications = new Map();

// ============ EXPRESS SUNUCUSU ============

// OAuth2 callback
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
        return res.sendFile(path.join(__dirname, 'fail.html'));
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
            return res.redirect('/fail.html?error=Geçersiz oturum! Lütfen tekrar deneyin.');
        }

        const { guildId: stateGuildId, discordUserId } = stateData;

        const guild = await client.guilds.fetch(stateGuildId);
        const member = await guild.members.fetch(discordUserId);
        const verifyRole = guild.roles.cache.get(verifyRoleId);

        if (!verifyRole) {
            return res.redirect('/fail.html?error=Doğrulama rolü bulunamadı!');
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

        // Başarılı sayfasına yönlendir
        const username = `${user.username}#${user.discriminator}`;
        res.redirect(`/success.html?username=${encodeURIComponent(username)}`);

    } catch (error) {
        console.error('OAuth2 hatası:', error);
        res.redirect(`/fail.html?error=${encodeURIComponent(error.message)}`);
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Sunucu http://localhost:${port} adresinde çalışıyor`);
});

// ============ DISCORD BOT ============

async function registerCommands() {
    const commands = [
        { 
            name: 'panelkur', 
            description: 'Doğrulama panelini kurar (Sadece Sunucu Sahibi)' 
        }
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

// ============ PANEL OLUŞTURMA FONKSİYONU (panel.json'dan) ============
async function createVerifyPanel(context) {
    try {
        // panel.json'dan embed'i al
        const panelEmbed = new EmbedBuilder(panelData.embeds[0]);

        // Buton oluştur - EMOJI KULLANIMI
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_button')
                    .setLabel('Hesabını Yetkilendir')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(emoji.simsek || '⚡') // ← EMOJI KULLANIMI
            );

        if (context.reply) {
            // Slash komut ise
            await context.reply({
                embeds: [panelEmbed],
                components: [row]
            });
        } else {
            // Mesaj komutu ise
            await context.channel.send({
                embeds: [panelEmbed],
                components: [row]
            });
            await context.reply({
                content: `${emoji.ok} Doğrulama paneli başarıyla oluşturuldu!`,
                allowedMentions: { repliedUser: false }
            });
        }
    } catch (error) {
        console.error('Panel oluşturma hatası:', error);
        throw error;
    }
}

// ============ SLASH KOMUT (/panelkur) ============
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand() && interaction.commandName === 'panelkur') {
            if (interaction.user.id !== ownerId) {
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

        // ============ BUTON ============
        if (interaction.isButton() && interaction.customId === 'verify_button') {
            const member = interaction.member;
            const verifyRole = interaction.guild.roles.cache.get(verifyRoleId);

            if (!verifyRole) {
                return interaction.reply({
                    content: `${emoji.dikkat} Doğrulama rolü bulunamadı!`,
                    ephemeral: true
                });
            }

            if (member.roles.cache.has(verifyRoleId)) {
                return interaction.reply({
                    content: `${emoji.ok} Zaten doğrulanmışsınız!`,
                    ephemeral: true
                });
            }

            const state = Math.random().toString(36).substring(7);
            pendingVerifications.set(state, {
                guildId: interaction.guildId,
                discordUserId: interaction.user.id
            });

            const authUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(config.redirectUri)}&scope=identify%20guilds&state=${state}`;

            // verify-message.json'dan embed'i al ve linki güncelle
            let verifyMessage = JSON.parse(JSON.stringify(verifyMessageData));
            if (verifyMessage.embeds && verifyMessage.embeds[0]) {
                verifyMessage.embeds[0].description = verifyMessage.embeds[0].description.replace(
                    /https:\/\/discord\.com\/oauth2\/authorize\?client_id=\.\.\.&response_type=code&redirect_uri=\.\.\.&scope=identify%20guilds&state=\.\.\./g,
                    authUrl
                );
            }

            const embed = new EmbedBuilder(verifyMessage.embeds[0]);

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }
    } catch (error) {
        console.error('Interaction hatası:', error);
    }
});

// ============ MESAJ KOMUTU (.panelkur) ============
client.on(Events.MessageCreate, async message => {
    // Bot mesajlarını ve DM'leri filtrele
    if (message.author.bot) return;
    if (message.channel.type === 1) return; // DM ise geç
    
    // Sadece .panelkur komutunu kontrol et
    if (message.content.toLowerCase() !== '.panelkur') return;
    
    // Owner kontrolü
    if (message.author.id !== ownerId) {
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
});

// ============ ROL KONTROLÜ ============
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (newMember.user.bot) return;

    const verifyRole = newMember.guild.roles.cache.get(verifyRoleId);
    if (!verifyRole) return;

    const hadRole = oldMember.roles.cache.has(verifyRoleId);
    const hasRole = newMember.roles.cache.has(verifyRoleId);

    if (hadRole && !hasRole) {
        try {
            await newMember.roles.add(verifyRole);
            console.log(`${emoji.simsek} ${newMember.user.tag} kullanıcısından rol kaldırıldı, tekrar verildi.`);
        } catch (error) {
            console.error(`${emoji.dikkat} Rol tekrar verme hatası:`, error);
        }
    }
});

// ============ BOT HAZIR ============
client.on(Events.ClientReady, async () => {
    console.log(`${emoji.kalp} Bot olarak giriş yapıldı: ${client.user.tag}`);
    console.log(`${emoji.users} Sunucu Sahibi ID: ${ownerId}`);
    console.log(`${emoji.yıldız} Verify Rolü ID: ${verifyRoleId}`);
    if (removeRoleId && removeRoleId !== "") {
        console.log(`${emoji.simsek} Alınacak Rol ID: ${removeRoleId}`);
    }
    console.log(`${emoji.ok} Redirect URI: ${config.redirectUri}`);
    await registerCommands();
});

// ============ BOTU BAŞLAT ============
client.login(token).catch(error => {
    console.error(`${emoji.dikkat} Bot giriş hatası:`, error);
});

process.on('unhandledRejection', error => {
    console.error(`${emoji.dikkat} Yakalanmamış hata:`, error);
});
