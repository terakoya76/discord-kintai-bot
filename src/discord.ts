import * as Discord from 'discord.js';

export {Message} from 'discord.js';

export const client = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.MessageContent,
  ],
});

const token = process.env.DISCORD_BOT_TOKEN;

export async function serve() {
  client.on('ready', () => {
    const user = client.user;
    if (!user) {
      console.log('Logged in as unknown user!');
    } else {
      console.log(`Logged in as ${user.tag}!`);
    }
  });

  await client.login(token);
}

const commandPrefix = '!';
const channelNameSuffix = '-kintai';

export function validateMessage(message: Discord.Message): boolean {
  return message.content.startsWith(commandPrefix) && !message.author.bot;
}

export function parseCommand(message: Discord.Message): string {
  const [command] = message.content
    .slice(commandPrefix.length)
    .trim()
    .split(/\s+/);

  return command;
}

export function getChannelFromMessage(
  message: Discord.Message,
): Discord.TextChannel | undefined {
  if (!validateChannel(message.channel)) return undefined;

  return message.channel;
}

export function getThreadFromMessage(
  message: Discord.Message,
): Discord.ThreadChannel | undefined {
  if (!validateThread(message.channel)) return undefined;

  return message.channel;
}

export function getChannelFromThread(
  thread: Discord.ThreadChannel,
): Discord.TextChannel | undefined {
  if (!thread.parent) return undefined;
  if (!validateChannel(thread.parent)) return undefined;

  return thread.parent;
}

export function getOrgFromChannel(channel: Discord.TextChannel): string {
  return channel.name.split(channelNameSuffix)[0];
}

export async function createThread(
  message: Discord.Message,
  today: string,
): Promise<Discord.ThreadChannel | undefined> {
  if (!validateChannel(message.channel)) return undefined;
  const thread = await message.channel.threads.create({
    name: today,
    // 1week
    // cf. https://discord-api-types.dev/api/discord-api-types-v10/enum/ThreadAutoArchiveDuration
    autoArchiveDuration: 1440 * 7,
  });

  return thread;
}

function validateChannel(
  channel: Discord.Channel,
): channel is Discord.TextChannel {
  return channel.isTextBased();
}

function validateThread(
  channel: Discord.Channel,
): channel is Discord.AnyThreadChannel {
  return channel.isThread();
}
