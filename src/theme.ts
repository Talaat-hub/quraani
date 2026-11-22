const light = {
  bg: '#F6F4EE', card: '#FFFFFF', text: '#1E2A24', muted: '#5F6A64', border: '#E3E0D6',
  primary: '#2F6B4F', onPrimary: '#FFFFFF', track: '#E8E4D8', danger: '#A1402F',
  hifz: '#2F6B4F', muraja: '#8A6420', tilawah: '#2F5D7A',
};
export type Colors = typeof light;

const dark: Colors = {
  bg: '#121614', card: '#1B211E', text: '#E9EDE9', muted: '#A3ADA7', border: '#2A322E',
  primary: '#6FB08F', onPrimary: '#0E1411', track: '#2A322E', danger: '#E08B7B',
  hifz: '#6FB08F', muraja: '#D2B06A', tilawah: '#7FB0CF',
};

export const COLORS = { light, dark };
