package org.storystage.prompter.context;

import java.io.IOException;
import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

import org.lgna.project.annotations.MethodTemplate;
import org.lgna.project.annotations.Visibility;

/**
 * Checks `src/alice/palette.json` against a compiled Alice, once, in CI (spec 02, "How this spec
 * was made"). It writes `src/alice/compiled-alice.json`, which `inventory.test.ts` compares:
 *
 * - `apiCatalog`: what StoryStage 1's real `ApiCatalog.entries()` returns;
 * - `palette`: reflection with Alice's palette rule, the rule `inventory.ts` follows on source.
 *
 * It sits in `ApiCatalog`'s package for that class's package-private helpers, and compiles with
 * an unchanged copy of `ApiCatalog.java` against `core/story-api`. Each line reads
 * `Class.name/parameters:details`, with details sorted.
 */
public final class AliceCatalogDump {
  /** Classes in `palette.json` that `ApiCatalog`'s roots don't reach. */
  private static final List<String> OTHER_CLASSES = Arrays.asList(
      "SCameraMarker", "SJoint", "SMarker", "SSun", "STarget", "SThingMarker", "STransport",
      "SVRHand", "SVRHeadset", "SVRUser");

  private static final Set<String> OBJECT_METHODS =
      Set.of("toString", "equals", "hashCode", "finalize", "clone");

  private AliceCatalogDump() {
    throw new AssertionError();
  }

  private static String line(Class<?> cls, String name, int params, Set<String> details) {
    return cls.getSimpleName() + "." + name + "/" + params + ":" + String.join(",", new TreeSet<>(details));
  }

  /** Alice's own rule (`MemberTabComposite`): PRIME_TIME, or no annotation at all. */
  private static boolean isOnPalette(Method m) {
    if (!Modifier.isPublic(m.getModifiers()) || Modifier.isStatic(m.getModifiers()) || m.isBridge() || m.isSynthetic()) {
      return false;
    }
    if (OBJECT_METHODS.contains(m.getName())) {
      return false;
    }
    MethodTemplate template = m.getAnnotation(MethodTemplate.class);
    return template == null || template.visibility() == Visibility.PRIME_TIME;
  }

  private static String paletteLine(Class<?> cls, Method m) {
    Class<?>[] types = m.getParameterTypes();
    boolean hasDetails = m.isVarArgs() && types[types.length - 1].isArray();
    Map<String, Class<?>> details = hasDetails ? ApiCatalog.keywordDetails(types[types.length - 1].getComponentType()) : new TreeMap<>();
    return line(cls, m.getName(), hasDetails ? types.length - 1 : types.length, details.keySet());
  }

  private static String quoted(Set<String> lines) {
    List<String> out = new ArrayList<>();
    for (String l : lines) {
      out.add("    \"" + l + "\"");
    }
    return String.join(",\n", out);
  }

  public static void main(String[] args) throws IOException, ClassNotFoundException {
    Set<String> apiCatalog = new TreeSet<>();
    for (ApiCatalog.Entry e : ApiCatalog.entries()) {
      apiCatalog.add(line(e.declaringClass, e.name, e.parameterNames.size(), e.details.keySet()));
    }

    Set<Class<?>> classes = new LinkedHashSet<>(ApiCatalog.classesInOrder());
    for (String name : OTHER_CLASSES) {
      classes.add(Class.forName("org.lgna.story." + name));
    }
    Set<String> palette = new TreeSet<>();
    for (Class<?> cls : classes) {
      for (Method m : cls.getDeclaredMethods()) {
        if (isOnPalette(m)) {
          palette.add(paletteLine(cls, m));
        }
      }
    }

    String json = "{\n  \"apiCatalog\": [\n" + quoted(apiCatalog) + "\n  ],\n  \"palette\": [\n" + quoted(palette) + "\n  ]\n}\n";
    Files.write(Path.of(args[0]), json.getBytes(StandardCharsets.UTF_8));
    System.out.println(apiCatalog.size() + " in ApiCatalog, " + palette.size() + " on the palette");
  }
}
