import { createHash } from 'crypto';

export const nameToColor = (source: string) => '#' + createHash('sha1').update(source).digest('hex').substring(0, 6);
