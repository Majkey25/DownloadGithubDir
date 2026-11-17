# Vendored browser dependencies

Unmodified browser bundles, served locally to avoid third-party script requests on the token form. SHA-512 integrity attributes are recorded in `index.html`.

| File | Source | SHA-256 |
| --- | --- | --- |
| jszip-3.10.2.min.js | https://registry.npmjs.org/jszip/-/jszip-3.10.2.tgz (`package/dist/jszip.min.js`) | 7f839b2d4688b845c105ebf5d2f9803075f91ea0fe72bdaac176c3a04dd3d2c1 |
| FileSaver-2.0.5.min.js | https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js | c68874cbaa2fd1650b7d770b328680ea765fb3376023cc3608427fde4f0d0481 |

License sources:

- JSZip: https://raw.githubusercontent.com/Stuk/jszip/v3.10.2/LICENSE.markdown. Used under its MIT option; the original dual-license notice is retained in `JSZip-LICENSE.txt`.
- FileSaver.js: https://cdn.jsdelivr.net/npm/file-saver@2.0.5/LICENSE.md. MIT notice retained in `FileSaver-LICENSE.txt`.

JSZip's browser bundle also contains pako, lie, immediate and setimmediate. Versions are recorded in its [v3.10.2 lockfile](https://github.com/Stuk/jszip/blob/v3.10.2/package-lock.json). Their notices are retained alongside the bundle:

- https://cdn.jsdelivr.net/npm/pako@1.0.5/LICENSE → `pako-LICENSE.txt`
- The zlib notice from https://cdn.jsdelivr.net/npm/pako@1.0.5/lib/zlib/inflate.js is retained in `pako-zlib-LICENSE.txt`.
- https://cdn.jsdelivr.net/npm/lie@3.3.0/license.md → `lie-LICENSE.txt`
- https://cdn.jsdelivr.net/npm/immediate@3.0.6/LICENSE.txt → `immediate-LICENSE.txt`
- https://cdn.jsdelivr.net/npm/setimmediate@1.0.5/LICENSE.txt → `setimmediate-LICENSE.txt`

JSZip's bundle and license were verified against its npm release on 17 November 2026. FileSaver and the retained notices are unchanged from 5 October 2026. Keep license notices and update integrity values when changing versions.
