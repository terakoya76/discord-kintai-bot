import * as Discord from './src/discord';
import * as HealthCheck from './src/healthcheck';
import * as Work from './src/work';

HealthCheck.serve();

Discord.client.on('messageCreate', async message => {
  console.log(message);
  if (!Discord.validateMessage(message)) return;

  const dd = new Date();
  const command = Discord.parseCommand(message);

  if (command === 'start') {
    console.log('command `!start` triggered');

    try {
      await Work.start(message, dd);
    } catch (e) {
      console.error(e);
    }
  }

  if (command === 'suspend') {
    console.log('command `!suspend` triggered');

    try {
      await Work.suspend(message);
    } catch (e) {
      console.error(e);
    }
  }

  if (command === 'resume') {
    console.log('command `!resume` triggered');

    try {
      await Work.resume(message);
    } catch (e) {
      console.error(e);
    }
  }

  if (command === 'end') {
    console.log('command `!end` triggered');

    try {
      await Work.end(message);
    } catch (e) {
      console.error(e);
    }
  }
});

Discord.serve().catch(console.error);
