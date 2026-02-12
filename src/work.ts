import * as SpreadSheet from './spreadsheet';
import * as Discord from './discord';

export async function start(message: Discord.Message, dd: Date) {
  const today = SpreadSheet.getTodayStr(dd);
  const sheetName = SpreadSheet.getSheetNameFromTodayStr(today);

  const channel = Discord.getChannelFromMessage(message);
  if (!channel) return;

  const org = Discord.getOrgFromChannel(channel);
  const sheetId = SpreadSheet.lookupSheetId(org);
  const data = await SpreadSheet.getSheetData(sheetId, sheetName);

  const thread = await Discord.createThread(message, today);
  if (!thread) return;

  await thread.send(`${message.author} has started work!`);

  data[today] = SpreadSheet.startWorkRow(thread.id);
  await SpreadSheet.updateSheetData(sheetId, sheetName, data);
}

export async function suspend(message: Discord.Message) {
  const thread = Discord.getThreadFromMessage(message);
  if (!thread) return;

  const today = thread.name;
  const sheetName = SpreadSheet.getSheetNameFromTodayStr(today);

  await thread.send(`${message.author} has suspended work!`);

  const channel = Discord.getChannelFromThread(thread);
  if (!channel) return;

  const org = Discord.getOrgFromChannel(channel);
  const sheetId = SpreadSheet.lookupSheetId(org);
  const data = await SpreadSheet.getSheetData(sheetId, sheetName);

  const row = {...data[today]};
  data[today] = SpreadSheet.suspendWorkRow(row);
  await SpreadSheet.updateSheetData(sheetId, sheetName, data);
}

export async function resume(message: Discord.Message) {
  const thread = Discord.getThreadFromMessage(message);
  if (!thread) return;

  const today = thread.name;
  const sheetName = SpreadSheet.getSheetNameFromTodayStr(today);

  await thread.send(`${message.author} has resumed work!`);

  const channel = Discord.getChannelFromThread(thread);
  if (!channel) return;

  const org = Discord.getOrgFromChannel(channel);
  const sheetId = SpreadSheet.lookupSheetId(org);
  const data = await SpreadSheet.getSheetData(sheetId, sheetName);

  const row = {...data[today]};
  data[today] = SpreadSheet.resumeWorkRow(row);
  await SpreadSheet.updateSheetData(sheetId, sheetName, data);
}

export async function end(message: Discord.Message) {
  const thread = Discord.getThreadFromMessage(message);
  if (!thread) return;

  const today = thread.name;
  const sheetName = SpreadSheet.getSheetNameFromTodayStr(today);

  await thread.send(`${message.author} has ended work!`);

  const channel = Discord.getChannelFromThread(thread);
  if (!channel) return;

  const org = Discord.getOrgFromChannel(channel);
  const sheetId = SpreadSheet.lookupSheetId(org);
  const data = await SpreadSheet.getSheetData(sheetId, sheetName);

  const row = {...data[today]};
  data[today] = SpreadSheet.endWorkRow(row);
  await SpreadSheet.updateSheetData(sheetId, sheetName, data);
}
