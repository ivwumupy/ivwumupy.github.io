{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };
  outputs = { self, nixpkgs, ... }@attrs:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      devShells.${system} = {
        default = pkgs.mkShellNoCC {
          nativeBuildInputs = with pkgs; [
            nodejs
          ];
        };
      };
    };
}
