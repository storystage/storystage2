/*
 * WP3.2: converts models in Alice 3's gallery to glTF 2.0 (binary .glb), with their meshes,
 * textures, skeleton and joint names in the default pose. Not shipped.
 *
 * It drives Alice's own loader and glTF exporter (org.lgna.story.resourceutilities,
 * JointedModelGltfExporter): the same model-loading code StoryStage 1 forked, taken from an Alice
 * 3.9 installation, so StoryStage 1 need not stay buildable. One file, run by the JDK's
 * source launcher, with no build step. Alice 3.9's jars need Java 21; its own runtime
 * (`<Alice 3>/jre/bin/java`) includes the compiler, so use that:
 *
 *   "<Alice 3>/jre/bin/java" -Djava.awt.headless=true \
 *        -Dorg.alice.ide.rootDirectory="C:\Program Files\Alice 3\application" \
 *        -cp "C:\Program Files\Alice 3\lib\*" \
 *        tools/convert-alice-models/java/ConvertAliceModels.java \
 *        --names <StoryStage 1>/core/i18n/src/main/resources/org/lgna/story/resources/GalleryNames.properties \
 *        --out <folder> [--only Biped/Alice,Quadruped/AbyssinianCat] [--list]
 *
 * It writes <folder>/<Folder>/<Name>/<Name>_<VARIANT>.glb for every texture variant and
 * <folder>/conversion-report.json. Variants drawn from The Sims 2's art are never converted
 * (licence audit, WP17.7). With --list it only lists every model and variant, marking Sims 2 art,
 * for the licence audit. Which models may be published is decided by the licence audit (3.1).
 */

import edu.cmu.cs.dennisc.java.util.zip.DataSource;
import edu.cmu.cs.dennisc.scenegraph.Component;
import edu.cmu.cs.dennisc.scenegraph.Geometry;
import edu.cmu.cs.dennisc.scenegraph.Joint;
import edu.cmu.cs.dennisc.scenegraph.Mesh;
import edu.cmu.cs.dennisc.scenegraph.SkeletonVisual;
import edu.cmu.cs.dennisc.scenegraph.WeightedMesh;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.lgna.story.resources.ImplementationAndVisualType;
import org.lgna.story.resources.JointedModelResource;
import org.lgna.story.resourceutilities.JointedModelGltfExporter;

public class ConvertAliceModels {
  private static final String PREFIX = "org.lgna.story.resources.";

  public static void main(String[] args) throws Exception {
    Map<String, String> opts = parseArgs(args);
    if (!opts.containsKey("names") || !opts.containsKey("out")) {
      System.err.println("Usage: ConvertAliceModels --names <GalleryNames.properties> --out <folder> [--only Folder/Name,...] [--list]");
      System.exit(2);
    }
    File out = new File(opts.get("out"));
    out.mkdirs();
    // --list: list every model and variant, marking Sims 2 art, without converting anything.
    boolean listOnly = opts.containsKey("list");
    Set<String> only = new TreeSet<>();
    if (opts.containsKey("only")) only.addAll(Arrays.asList(opts.get("only").split(",")));

    // Class folders ("MarineMammal") by package, and models in gallery order.
    Map<String, String> folders = new LinkedHashMap<>();
    List<String[]> models = new ArrayList<>();
    for (String raw : Files.readAllLines(new File(opts.get("names")).toPath(), StandardCharsets.UTF_8)) {
      String line = raw.trim();
      int eq = line.indexOf('=');
      if (!line.startsWith(PREFIX) || eq < 0) continue;
      String[] parts = line.substring(PREFIX.length(), eq).trim().split("\\.");
      if (parts.length == 1 && Character.isUpperCase(parts[0].charAt(0))) folders.put(parts[0].toLowerCase(), parts[0]);
      else if (parts.length == 2 && Character.isUpperCase(parts[1].charAt(0))) models.add(parts);
    }

    List<String> report = new ArrayList<>();
    int converted = 0;
    for (String[] m : models) {
      String pkg = m[0];
      String name = m[1];
      String folder = folders.getOrDefault(pkg, pkg);
      String key = folder + "/" + name;
      if (!only.isEmpty() && !only.contains(key)) continue;
      Class<?> cls;
      try {
        cls = Class.forName(PREFIX + pkg + "." + name + "Resource");
      } catch (Throwable t) {
        report.add(entry(key, null, null, null, 0, "no resource class: " + t));
        continue;
      }
      Object[] variants = cls.getEnumConstants();
      if (variants == null) {
        report.add(entry(key, null, null, null, 0, "resource class is not an enum"));
        continue;
      }
      for (Object v : variants) {
        String variant = ((Enum<?>) v).name();
        if (isSims2(v)) {
          report.add(entry(key, variant, null, null, 0, "skipped: drawn from The Sims 2's art (WP17.7)"));
          continue;
        }
        if (listOnly) {
          report.add(entry(key, variant, null, null, 0, null));
          continue;
        }
        try {
          JointedModelResource resource = (JointedModelResource) v;
          SkeletonVisual sv = (SkeletonVisual) ImplementationAndVisualType.ALICE.getFactory(resource).createVisualData().getSgVisuals()[0];
          nameMeshesUniquely(sv);
          File dir = new File(out, folder + File.separator + name);
          dir.mkdirs();
          String base = name + "_" + variant;
          DataSource ds = new JointedModelGltfExporter(sv, null, base, dir.getPath(), Collections.emptyMap()).createStructureDataSource();
          File glb = new File(ds.getName());
          try (OutputStream os = new FileOutputStream(glb)) {
            ds.write(os);
          }
          List<String> joints = new ArrayList<>();
          Joint root = sv.skeleton.getValue();
          if (root != null) collectJoints(root, joints);
          String rel = folder + "/" + name + "/" + glb.getName();
          report.add(entry(key, variant, rel, joints, glb.length(), null));
          converted++;
          System.out.println("converted " + rel);
        } catch (Throwable t) {
          report.add(entry(key, variant, null, null, 0, String.valueOf(t)));
          System.err.println("failed " + key + " " + variant + ": " + t);
        }
      }
    }
    String json = "{\n  \"tool\": \"tools/convert-alice-models/java/ConvertAliceModels.java\",\n  \"alice\": " + quote(String.valueOf(System.getProperty("org.alice.ide.rootDirectory"))) + ",\n  \"models\": [\n    " + String.join(",\n    ", report) + "\n  ]\n}\n";
    Files.writeString(new File(out, "conversion-report.json").toPath(), json, StandardCharsets.UTF_8);
    System.out.println(converted + " variants converted; report in " + new File(out, "conversion-report.json"));
  }

  /**
   * Alice's glTF exporter finds each mesh's skin by the mesh's name, so meshes without a name, or
   * with the same name, all get the last skin and fall apart when drawn. Give each its own name.
   */
  private static void nameMeshesUniquely(SkeletonVisual sv) {
    Set<String> seen = new HashSet<>();
    int n = 0;
    List<Mesh> meshes = new ArrayList<>();
    for (Geometry g : sv.geometries.getValue()) if (g instanceof Mesh) meshes.add((Mesh) g);
    meshes.addAll(Arrays.asList(sv.weightedMeshes.getValue()));
    for (Mesh m : meshes) {
      String name = m.getName();
      while (name == null || name.isEmpty() || !seen.add(name)) name = "mesh" + n++;
      m.setName(name);
    }
  }

  /** A variant whose resource type is SIMS2 uses The Sims 2's art. */
  private static boolean isSims2(Object variant) {
    try {
      Field f = variant.getClass().getDeclaredField("resourceType");
      f.setAccessible(true);
      return f.get(variant) == ImplementationAndVisualType.SIMS2;
    } catch (ReflectiveOperationException | RuntimeException e) {
      return false;
    }
  }

  private static void collectJoints(Joint joint, List<String> out) {
    out.add(joint.jointID.getValue());
    for (int i = 0; i < joint.getComponentCount(); i++) {
      Component c = joint.getComponentAt(i);
      if (c instanceof Joint) collectJoints((Joint) c, out);
    }
  }

  private static String entry(String key, String variant, String file, List<String> joints, long bytes, String error) {
    StringBuilder sb = new StringBuilder("{\"key\": ").append(quote(key));
    sb.append(", \"variant\": ").append(variant == null ? "null" : quote(variant));
    sb.append(", \"file\": ").append(file == null ? "null" : quote(file));
    sb.append(", \"bytes\": ").append(bytes);
    sb.append(", \"joints\": [");
    if (joints != null) {
      for (int i = 0; i < joints.size(); i++) sb.append(i == 0 ? "" : ", ").append(quote(joints.get(i)));
    }
    sb.append("], \"error\": ").append(error == null ? "null" : quote(error)).append('}');
    return sb.toString();
  }

  private static String quote(String s) {
    StringBuilder sb = new StringBuilder("\"");
    for (char c : s.toCharArray()) {
      if (c == '"' || c == '\\') sb.append('\\').append(c);
      else if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
      else sb.append(c);
    }
    return sb.append('"').toString();
  }

  private static Map<String, String> parseArgs(String[] args) {
    Map<String, String> m = new LinkedHashMap<>();
    for (int i = 0; i < args.length; i++) {
      if (!args[i].startsWith("--")) continue;
      boolean hasValue = i + 1 < args.length && !args[i + 1].startsWith("--");
      m.put(args[i].substring(2), hasValue ? args[++i] : "true");
    }
    return m;
  }
}
