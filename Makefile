clean:
	rm -r ./output
	mkdir ./output
	mkdir ./output/tau
	mkdir ./output/sol

build: main.circom
	make clean
	circom main.circom --r1cs --wasm --sym --c --json -o output

witness:
	node output/main_js/generate_witness ./output/main_js/main.wasm ./inputs/input.json output/witness.wtns

ceremony1:
	snarkjs powersoftau new bn128 12 ./output/tau/pot12_0000.ptau -v
	snarkjs powersoftau contribute ./output/tau/pot12_0000.ptau ./output/tau/pot12_0001.ptau --name="First contribution"

ceremony:
	snarkjs powersoftau prepare phase2 ./output/tau/pot12_0001.ptau ./output/tau/pot12_final.ptau -v
	
generate-zkey:
	snarkjs groth16 setup ./output/main.r1cs ./output/tau/pot12_final.ptau ./output/key.zkey

contribute-v2:
	snarkjs	zkey contribute ./output/key.zkey ./output/key1.zkey --name="CamiloTDex" -v

generate-verification:
	 snarkjs zkey export verificationKey ./output/key1.zkey ./output/verification-key.json

proof:
	snarkjs groth16 prove ./output/key1.zkey ./output/witness.wtns ./output/proof.json ./output/public.json

verify:
	snarkjs groth16 verify ./output/verification-key.json ./output/public.json ./output/proof.json

generate-verifier:
	snarkjs zkey export solidityverifier ./output/key1.zkey ./output/sol/verifier.sol

analyze:
	node analyzer.js

inspect:
	make build
	make analyze