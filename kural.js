const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('./config.json');
const emoji = require('./emoji.json');

module.exports = {
    name: 'kural',
    description: 'Sunucu kurallarını gösterir',
    
    async execute(message, args) {
        try {
            await sendRules(message.channel);
        } catch (error) {
            console.error('Kural gönderme hatası:', error);
            await message.reply(`${emoji.dikkat} Kurallar gönderilirken bir hata oluştu.`);
        }
    },

    // Slash komut için
    async executeSlash(interaction) {
        try {
            await sendRules(interaction.channel);
            await interaction.reply({ 
                content: `${emoji.ok} Kurallar başarıyla gönderildi!`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Kural gönderme hatası:', error);
            await interaction.reply({ 
                content: `${emoji.dikkat} Kurallar gönderilirken bir hata oluştu.`, 
                ephemeral: true 
            });
        }
    }
};

// Kuralları gönderme fonksiyonu
async function sendRules(channel) {
    // Embed oluştur - İLK JSON'DAKİ GİBİ
    const embed = new EmbedBuilder()
        .setDescription(
            "``` ```\n" +
            "> *Lütfen tüm kuralları dikkatlice okuyun — kuralları ihlal etmek uyarı, susturma veya ban ile sonuçlanabilir.*\n\n" +
            "<:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129><:D2:1519716125099688129>"
        )
        .addFields(
            {
                name: "<:Icon_Rules_2:1519717889320681482> ```RESPECT & SAFETY```",
                value: "<:Empty:1519717497186812084>\n> <:CF3:1519719197998055545> `1. Saygılı olun; taciz, zorbalık, toksik davranış veya drama yasaktır.`\n> <:CF3:1519719197998055545> `2. Nefret söylemi, ırkçılık, küfür, homofobi veya transfobi yasaktır.`\n> <:CF3:1519719197998055545> `3. Tehdit, doxxing, raid konuşması veya kendine zarar verme teşviki yasaktır.`"
            },
            {
                name: "<:Icon_Cogwheel:1519717925672583249> ```CHANNELS & CONTENT```",
                value: "<:Empty:1519717497186812084>\n> <:CF3:1519719197998055545> `4.` [NSFW images/videos = instant ban ](https://discord.com/guidelines)\n> <:CF3:1519719197998055545> `5. Spam, flood ve ping abuse yasaktır.`\n> <:CF3:1519719197998055545> `6. Konuyla ilgili kalın ve doğru kanalları kullanın.`\n> <:CF3:1519719197998055545> `7. Kamu kanallarında siyaset konuşmak yasaktır.`\n> <:CF3:1519719197998055545> `8. Sesli sohbetlerde mic spam, aşırı gürültü ve rahatsız edici davranış yasaktır.`"
            },
            {
                name: "<:Link_Symbol:1519717970056577157> ```TRUST & IDENTITY```",
                value: "<:Empty:1519717497186812084>\n> <:CF3:1519719197998055545> `10. Başkasını taklit etmek veya sahte kimlik kullanmak yasaktır.`\n> <:CF3:1519719197998055545> `11. Scam, sahte giveaway ve şüpheli link paylaşımı yasaktır.`\n> <:CF3:1519719197998055545> `12. Ban evasion ve alt hesap ile ceza kaçırmak yasaktır.`\n> <:CF3:1519719197998055545> `13. Yanlış bilgi yaymak veya kasıtlı yanıltmak yasaktır.`"
            },
            {
                name: "<:Icon_Cogwheel:1519717925672583249> `DISCORD, STAFF & PROMOTION`",
                value: "<:Empty:1519717497186812084>\n> <:CF3:1519719197998055545> `14.`[Discord TOS](https://discord.com/terms) `kurallarına uymak zorunludur.`\n> <:CF3:1519719197998055545> `15. İzinsiz reklam veya promosyon yapmak yasaktır.`\n> <:CF3:1519719197998055545> `16. Automod bypass yapmak yasaktır.`\n> <:CF3:1519719197998055545> `17. Başka sunucuları promosyon amacıyla paylaşmak yasaktır.`\n> <:CF3:1519719197998055545> `18. Yönetici kararları kesindir, sorunlar için ticket açın.`\n> <:CF3:1519719197998055545> `19. Sahte rapor, troll ticket veya sahte başvuru`  [direkt ban sebebidir. ](https://discord.com/guidelines)\n\n*Bu sunucuda bulunarak yukarıdaki kuralları ve Discord TOS'unu kabul etmiş sayılırsınız.*",
                inline: true
            }
        );

    // 🔥 BUTON - Sadece Discord TOS butonu
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('Discord TOS')
                .setStyle(ButtonStyle.Link)
                .setURL('https://discord.com/terms')
                .setEmoji(emoji.discordlogo || '📜') // <:Icon_Discord:1519698527650054335> emojisi
        );

    // Mesajı gönder
    await channel.send({
        embeds: [embed],
        components: [row]
    });
}