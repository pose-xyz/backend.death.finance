import _ from 'lodash';

const permissions: any = {
  CREATE_INSTANT_INVITE: 1,
  KICK_MEMBERS: 2,
  BAN_MEMBERS: 4,
  ADMINISTRATOR: 8,
  MANAGE_CHANNELS: 16,
  MANAGE_GUILD: 32,
  ADD_REACTIONS: 64,
  VIEW_AUDIT_LOG: 128,
  PRIORITY_SPEAKER: 256,
  VIEW_CHANNEL: 1024,
  READ_MESSAGES: 1024,
  SEND_MESSAGES: 2048,
  SEND_TTS_MESSAGES: 4096,
  MANAGE_MESSAGES: 8192,
  EMBED_LINKS: 16384,
  ATTACH_FILES: 32768,
  READ_MESSAGE_HISTORY: 65536,
  MENTION_EVERYONE: 131072,
  EXTERNAL_EMOJIS: 262144,
  USE_EXTERNAL_EMOJIS: 262144,
  CONNECT: 1048576,
  SPEAK: 2097152,
  MUTE_MEMBERS: 4194304,
  DEAFEN_MEMBERS: 8388608,
  MOVE_MEMBERS: 16777216,
  USE_VAD: 33554432,
  CHANGE_NICKNAME: 67108864,
  MANAGE_NICKNAMES: 134217728,
  MANAGE_ROLES: 268435456,
  MANAGE_ROLES_OR_PERMISSIONS: 268435456,
  MANAGE_WEBHOOKS: 536870912,
  MANAGE_EMOJIS: 1073741824
};

export const convertPerms = (permNumber: any) => {
  if (isNaN(Number(permNumber))) {
    throw new TypeError(`Expected permissions number, and received ${typeof permNumber} instead.`);
  }

  permNumber = Number(permNumber);

  const evaluatedPerms: any = {};

  _.forEach(permissions, (value, key) => {
    // tslint:disable-next-line:no-bitwise
    evaluatedPerms[key] = Boolean(permNumber & value);
  });

  return evaluatedPerms;
};
