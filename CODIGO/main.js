require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');
const https = require('https');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static'); 

ffmpeg.setFfmpegPath(ffmpegPath); 

const bot = new Telegraf(process.env.BOT_TOKEN);

const tempFolder = path.join(__dirname, 'temp');
if (!fs.existsSync(tempFolder)) {
  fs.mkdirSync(tempFolder);
}

bot.start((ctx) => {
  ctx.reply("🎵 Envie um áudio para converter, 🎥 envie um vídeo, ou 🖼️ envie uma imagem! Eu vou te mostrar as opções de formatos disponíveis.");
});


let userFileId = {};
let userFileType = {};

bot.on('audio', (ctx) => {
  const fileId = ctx.message.audio.file_id;
  userFileId[ctx.from.id] = fileId;
  userFileType[ctx.from.id] = 'audio';

  ctx.reply("Selecione o formato para conversão de áudio:", 
    Markup.inlineKeyboard([
      [Markup.button.callback('MP3', 'convert_audio_mp3')],
      [Markup.button.callback('WAV', 'convert_audio_wav')],
      [Markup.button.callback('OGG', 'convert_audio_ogg')]
    ])
  );
});

bot.on('video', (ctx) => {
  const fileId = ctx.message.video.file_id;
  userFileId[ctx.from.id] = fileId;
  userFileType[ctx.from.id] = 'video';

  ctx.reply("Selecione o formato para conversão de vídeo:", 
    Markup.inlineKeyboard([
      [Markup.button.callback('MP4', 'convert_video_mp4')],
      [Markup.button.callback('AVI', 'convert_video_avi')]
    ])
  );
});

bot.on('photo', (ctx) => {
  const fileId = ctx.message.photo.pop().file_id;
  userFileId[ctx.from.id] = fileId;
  userFileType[ctx.from.id] = 'image';

  ctx.reply("Selecione o formato para conversão de imagem:", 
    Markup.inlineKeyboard([
      [Markup.button.callback('JPG', 'convert_image_jpg')],
      [Markup.button.callback('JPEG', 'convert_image_jpeg')],
      [Markup.button.callback('PNG', 'convert_image_png')],
      [Markup.button.callback('ICO', 'convert_image_ico')]
    ])
  );
});

function convertImage(ctx, format) {
  const userId = ctx.from.id;
  const fileId = userFileId[userId];
  
  if (!fileId) {
    return ctx.reply("❌ Não foi encontrada uma imagem para converter.");
  }
  
  ctx.replyWithChatAction('upload_document').then(() => {
    ctx.telegram.getFileLink(fileId).then(fileLink => {
      const inputFile = path.join(__dirname, `${fileId}_input.jpg`);
      const outputFile = path.join(__dirname, `${fileId}_output.${format}`);
      
      downloadFile(fileLink, inputFile, () => {
        if (format === 'ico') {
          const pngTempFile = path.join(__dirname, `${fileId}_temp.png`);
          sharp(inputFile)
            .resize(256, 256)
            .toFormat('png')
            .toFile(pngTempFile, (err) => {
              if (err) {
                console.error('Erro ao converter para PNG:', err);
                return ctx.reply('❌ Ocorreu um erro ao converter a imagem.');
              }
              pngToIco(pngTempFile)
                .then(buf => {
                  fs.writeFileSync(outputFile, buf);
                  ctx.replyWithDocument({ source: outputFile }).then(() => {
                    fs.unlinkSync(inputFile);
                    fs.unlinkSync(pngTempFile);
                    fs.unlinkSync(outputFile);
                  });
                })
                .catch(err => {
                  console.error('Erro ao converter para ICO:', err);
                  ctx.reply('❌ Ocorreu um erro ao converter a imagem para ICO.');
                });
            });
        } 
        else {
          sharp(inputFile)
            .toFormat(format)
            .toFile(outputFile, (err) => {
              if (err) {
                console.error('Erro na conversão de imagem:', err);
                return ctx.reply('❌ Ocorreu um erro ao converter a imagem.');
              }
              ctx.replyWithDocument({ source: outputFile }).then(() => {
                fs.unlinkSync(inputFile);
                fs.unlinkSync(outputFile);
              });
            });
        }
      });
    });
  });
}

function convertVideo(ctx, format) {
  const userId = ctx.from.id;
  const fileId = userFileId[userId];
  
  if (!fileId) {
    return ctx.reply("❌ Não foi encontrado um vídeo para converter.");
  }
  
  ctx.replyWithChatAction('upload_document').then(() => {
    ctx.telegram.getFileLink(fileId).then(fileLink => {
      const inputFile = path.join(__dirname, `${fileId}_input.mp4`);
      const outputFile = path.join(__dirname, `${fileId}_output.${format}`);
      
      downloadFile(fileLink, inputFile, () => {
        ffmpeg(inputFile)
          .toFormat(format)
          .on('end', () => {
            ctx.replyWithDocument({ source: outputFile }).then(() => {
              fs.unlinkSync(inputFile);
              fs.unlinkSync(outputFile);
            });
          })
          .on('error', (err) => {
            console.error('Erro na conversão de vídeo:', err);
            ctx.reply('❌ Ocorreu um erro ao converter o vídeo.');
          })
          .save(outputFile);
      });
    });
  });
}

function convertAudio(ctx, format) {
  const userId = ctx.from.id;
  const fileId = userFileId[userId];
  
  if (!fileId) {
    return ctx.reply("❌ Não foi encontrado um áudio para converter.");
  }
  
  ctx.replyWithChatAction('upload_document').then(() => {
    ctx.telegram.getFileLink(fileId).then(fileLink => {
      const inputFile = path.join(__dirname, `${fileId}_input.mp3`);
      const outputFile = path.join(__dirname, `${fileId}_output.${format}`);
      
      downloadFile(fileLink, inputFile, () => {
        ffmpeg(inputFile)
          .toFormat(format)
          .on('end', () => {
            ctx.replyWithDocument({ source: outputFile }).then(() => {
              fs.unlinkSync(inputFile);
              fs.unlinkSync(outputFile);
            });
          })
          .on('error', (err) => {
            console.error('Erro na conversão de áudio:', err);
            ctx.reply('❌ Ocorreu um erro ao converter o áudio.');
          })
          .save(outputFile);
      });
    });
  });
}

function downloadFile(url, dest, callback) {
  const file = fs.createWriteStream(dest);
  https.get(url, (response) => {
    response.pipe(file);
    file.on('finish', () => {
      file.close(callback);
    });
  }).on('error', (err) => {
    fs.unlink(dest);
    console.error('Erro ao baixar arquivo:', err);
  });
}

bot.action('convert_image_jpg', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🔄 Convertendo sua imagem para JPG...");
  convertImage(ctx, 'jpg');
});

bot.action('convert_image_jpeg', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🔄 Convertendo sua imagem para JPEG...");
  convertImage(ctx, 'jpeg');
});

bot.action('convert_image_png', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🔄 Convertendo sua imagem para PNG...");
  convertImage(ctx, 'png');
});

bot.action('convert_image_ico', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🔄 Convertendo sua imagem para ICO...");
  convertImage(ctx, 'ico');
});

bot.action('convert_video_mp4', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🔄 Convertendo seu vídeo para MP4...");
  convertVideo(ctx, 'mp4');
});

bot.action('convert_video_avi', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🔄 Convertendo seu vídeo para AVI...");
  convertVideo(ctx, 'avi');
});

bot.action('convert_audio_mp3', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🔄 Convertendo seu áudio para MP3...");
  convertAudio(ctx, 'mp3');
});

bot.action('convert_audio_wav', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🔄 Convertendo seu áudio para WAV...");
  convertAudio(ctx, 'wav');
});

bot.action('convert_audio_ogg', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("🔄 Convertendo seu áudio para OGG...");
  convertAudio(ctx, 'ogg');
});

bot.launch();

console.log("Bot de conversão de mídias iniciado!");
