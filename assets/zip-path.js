export function isSafeArchivePath(path) {
  return typeof path === 'string' && path.split('/').every(segment =>
    segment !== ''
    && segment !== '.'
    && segment !== '..'
    && !/[\u0000-\u001f<>:"\\|?*]/.test(segment)
    && !/[. ]$/.test(segment)
    && !/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment)
  );
}
