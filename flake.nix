{
  description = "Tomet Web Editor (Svelte 5 + CodeMirror 6 interactive playground)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs = inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      perSystem = { pkgs, ... }: {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs
            pnpm
          ];

          shellHook = ''
            echo "🎨 Tomet Web Editor Development Shell"
          '';
        };
      };
    };
}
