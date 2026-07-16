import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.jce.spec.ECParameterSpec;
import org.bouncycastle.jce.spec.ECPublicKeySpec;
import org.bouncycastle.math.ec.ECPoint;
import org.bouncycastle.jce.ECNamedCurveTable;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Security;
import java.util.Base64;

public class KeyGen {
    public static void main(String[] args) throws Exception {
        Security.addProvider(new BouncyCastleProvider());
        
        // This is the mock HIU key:
        byte[] uncompressed = Base64.getDecoder().decode("BCILCh4buyxvsNpOCrGXrEeQT3biOUd6ut33iGwzNFyrTNYsPoQy2HewBRDyffyU3N5k6708EvOD8WzN5pYfzBc=");
        
        // Bouncycastle curve for ABDM is "curve25519"
        ECParameterSpec spec = ECNamedCurveTable.getParameterSpec("curve25519");
        if (spec == null) {
            System.out.println("Could not find curve25519");
            return;
        }
        
        ECPoint point = spec.getCurve().decodePoint(uncompressed);
        ECPublicKeySpec pubSpec = new ECPublicKeySpec(point, spec);
        
        KeyFactory kf = KeyFactory.getInstance("ECDH", "BC");
        PublicKey pubKey = kf.generatePublic(pubSpec);
        
        // Output the full X.509 SPKI in Hex
        byte[] encoded = pubKey.getEncoded();
        StringBuilder sb = new StringBuilder();
        for (byte b : encoded) {
            sb.append(String.format("%02x", b));
        }
        System.out.println("X509 SPKI Hex: " + sb.toString());
        
        // Let's see the header
        System.out.println("Header length: " + (encoded.length - 65));
        
        // Now encode it back to base64
        System.out.println("X509 SPKI Base64: " + Base64.getEncoder().encodeToString(encoded));
    }
}
