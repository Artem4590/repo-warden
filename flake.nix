{
  description = "Minimal Nix flake for repo-warden development and local runs";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        nodejs = pkgs.nodejs_20;

        mkRepoWardenScript = name: npmScript:
          pkgs.writeShellApplication {
            inherit name;
            runtimeInputs = [ nodejs ];
            text = ''
              repo_root="${toString ./.}"
              cd "$repo_root"

              if [ ! -f package.json ]; then
                echo "package.json not found in $repo_root" >&2
                exit 1
              fi

              if [ ! -d node_modules ]; then
                echo "node_modules is missing. Run 'npm install' first (for example inside 'nix develop')." >&2
                exit 1
              fi

              exec npm run ${npmScript} -- "$@"
            '';
          };

        runScript = pkgs.writeShellApplication {
          name = "repo-warden";
          runtimeInputs = [ nodejs ];
          text = ''
            repo_root="${toString ./.}"
            cd "$repo_root"

            if [ ! -f package.json ]; then
              echo "package.json not found in $repo_root" >&2
              exit 1
            fi

            if [ ! -d node_modules ]; then
              echo "node_modules is missing. Run 'npm install' first (for example inside 'nix develop')." >&2
              exit 1
            fi

            npm run build
            exec npm run start -- "$@"
          '';
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [ nodejs ];
        };

        packages = {
          default = runScript;
          build = mkRepoWardenScript "repo-warden-build" "build";
          check = mkRepoWardenScript "repo-warden-check" "check";
          test = mkRepoWardenScript "repo-warden-test" "test";
        };

        apps = {
          default = {
            type = "app";
            program = "${runScript}/bin/repo-warden";
          };
          build = {
            type = "app";
            program = "${self.packages.${system}.build}/bin/repo-warden-build";
          };
          check = {
            type = "app";
            program = "${self.packages.${system}.check}/bin/repo-warden-check";
          };
          test = {
            type = "app";
            program = "${self.packages.${system}.test}/bin/repo-warden-test";
          };
        };
      });
}
