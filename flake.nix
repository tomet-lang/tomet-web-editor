{
  description = "Tomet Web Editor (Svelte 5 + CodeMirror 6 interactive playground)";

  nixConfig = {
    extra-substituters = [ "https://tomet.cachix.org" ];
    extra-trusted-public-keys = [ "tomet.cachix.org-1:9c/iO8Tb6YOM+3r55t12W3fOJK+66itPEaIe8Rs9MDw=" ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    #= Tool
    tomet.url = "github:tomet-lang/tomet";
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      imports = [
        inputs.treefmt-nix.flakeModule
      ];

      perSystem =
        { pkgs, ... }:
        {
          devShells.default = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs
              pnpm
              deno
              just
              inputs.tomet.packages.${pkgs.stdenv.hostPlatform.system}.tomet
              inputs.tomet.packages.${pkgs.stdenv.hostPlatform.system}.tomet-lsp
            ];

            shellHook = ''
              echo "🎨 Tomet Web Editor Development Shell"
            '';
          };

          treefmt = {
            projectRootFile = "flake.nix";
            programs = {
              nixfmt.enable = true;
              biome.enable = true;
            };
            settings.formatter.tomet = {
              command = "${inputs.tomet.packages.${pkgs.stdenv.hostPlatform.system}.tomet}/bin/tomet";
              options = [
                "format"
                "-i"
              ];
              includes = [ "*.tmt" ];
            };
          };
        };
    };
}
