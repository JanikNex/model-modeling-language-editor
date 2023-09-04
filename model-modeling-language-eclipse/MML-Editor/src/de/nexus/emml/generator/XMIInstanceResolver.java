package de.nexus.emml.generator;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.emf.common.util.EList;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EReference;

import de.nexus.emml.generator.entities.instance.ReferenceEntry;

public class XMIInstanceResolver {
	private final Map<String, EObject> objects = new HashMap<String, EObject>();
	private final Map<String, List<ReferenceEntry>> unresolvedReferences = new HashMap<String, List<ReferenceEntry>>();

	public void store(String objId, EObject obj) {
		this.objects.put(objId, obj);
	}

	public void registerReference(String objId, List<ReferenceEntry> references) {
		this.unresolvedReferences.put(objId, references);
	}

	public void resolveUnresolvedReferences(EcoreTypeResolver typeResolver) {
		for (Map.Entry<String, List<ReferenceEntry>> entry : this.unresolvedReferences.entrySet()) {
			EObject base = this.objects.get(entry.getKey());
			for (ReferenceEntry ref : entry.getValue()) {
				EReference eref = typeResolver.resolveReference(ref);
				if (eref.isMany()) {
					@SuppressWarnings("unchecked")
					EList<EObject> oldVals = (EList<EObject>) base.eGet(eref);
					for (String refId : ref.getReferencedIds()) {
						EObject target = this.objects.get(refId);
						oldVals.add(target);
					}
					base.eSet(eref, oldVals);
				} else {
					if (ref.getReferencedIds().size() > 0) {
						String refId = ref.getReferencedIds().get(0);
						EObject target = this.objects.get(refId);
						base.eSet(eref, target);
					}
				}
			}
		}
	}
}
