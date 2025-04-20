require "jwt"

key_file = "/Users/kartikeybihani/Desktop/AuthKey_ZMQBJVJ58J.p8"
team_id = "8R384P5K54"
client_id = "com.kartikey08.financify.service"
key_id = "ZMQBJVJ58J"
validity_period = 180 # In days. Max 180 (6 months) according to Apple docs.

private_key = OpenSSL::PKey::EC.new IO.read key_file

token = JWT.encode(
	{
		iss: team_id,
		iat: Time.now.to_i,
		exp: Time.now.to_i + 86400 * validity_period,
		aud: "https://appleid.apple.com",
		sub: client_id
	},
	private_key,
	"ES256",
	header_fields=
	{
		kid: key_id 
	}
)
puts token