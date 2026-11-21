/** Google's Draco glTF codec (`draco3dgltf`, Apache-2.0), which ships no types of its own. */
declare module 'draco3dgltf' {
  const draco3d: {
    createDecoderModule(): Promise<unknown>;
    createEncoderModule(): Promise<unknown>;
  };
  export default draco3d;
}
